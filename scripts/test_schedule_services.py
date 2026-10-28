import copy
import types
import unittest
from unittest.mock import patch

import ingest_pending as ingest
from schedule_services import ServiceIndex, people


STAFF = {"services": {
    "uco": [{"surname": "Perez", "name": "Jose"}, {"surname": "Gomez", "name": "Celia"}],
    "uccyq": [{"surname": "Centeno", "name": "Ana"}, {"surname": "Esquivel", "name": "Eva"}, {"surname": "Sin", "name": "Luis"}],
}}


def doc(names, slug=None, sender="responsable@example.org", month=1, key=None):
    return {"id": key or f"{slug}-{month}", "departments": [slug] if slug else [], "month": month, "year": 2026,
            "source": {"sender": sender}, "flags": [], "shifts": [{"text": name} for name in names]}


class ScheduleServicesTest(unittest.TestCase):
    def test_majority_counts_people_not_repeated_days(self):
        index = ServiceIndex([], STAFF)
        result = index.identify(doc(["Perez"] * 31 + ["Centeno", "Esquivel", "Sin"]))
        self.assertEqual((result["slug"], result["people"], result["matched"]), ("uccyq", 3, 3))
        self.assertEqual(result["method"], "mayoria_medicos")

    def test_full_name_and_surname_are_the_same_vote_and_typos_can_match(self):
        index = ServiceIndex([], STAFF)
        result = index.identify(doc(["Dr. Jose Perez 08-20", "Perez", "Dra. Celia Gomes", "Celia Gomes"]))
        self.assertEqual((result["slug"], result["people"]), ("uco", 2))

    def test_shared_surname_does_not_decide_service(self):
        staff = {"services": {"uco": [{"name": "Ana", "surname": "Ruiz"}], "uccyq": [{"name": "Luis", "surname": "Ruiz"}]}}
        result = ServiceIndex([], staff).identify(doc(["Ruiz"] * 31))
        self.assertIsNone(result["slug"])
        self.assertEqual(result["people"], 1)

    def test_repeated_attachments_do_not_make_a_sender_habitual(self):
        references = [doc(["Perez"], "uco", month=1, key=str(n)) for n in range(20)]
        result = ServiceIndex(references).identify(doc([]))
        self.assertEqual((result["slug"], result["senderPeriods"]), (None, 1))
        references.append(doc(["Perez"], "uco", month=2))
        self.assertEqual(ServiceIndex(references).identify(doc([]))["slug"], "uco")

    def test_sender_and_one_known_doctor_can_support_each_other(self):
        index = ServiceIndex([doc(["Perez"], "uco")], STAFF)
        result = index.identify(doc(["Perez"]))
        self.assertEqual((result["slug"], result["method"]), ("uco", "remitente_y_medicos"))

    def test_conflicting_doctors_and_sender_never_fall_back_to_sender(self):
        index = ServiceIndex([doc(["Perez"], "uco", month=m) for m in (1, 2)], STAFF)
        target = doc(["Centeno", "Esquivel", "Sin"])
        ingest.resolve_departments([target], index)
        ingest.resolve_unread([target], [], [{"id": target["id"], "from": "responsable@example.org"}], index)
        self.assertEqual(target["departments"], [])
        self.assertEqual(target["source"]["serviceEvidence"]["status"], "contradiccion")

    def test_sender_conflicting_with_mail_context_needs_review(self):
        index = ServiceIndex([doc(["Perez"], "uco", month=m) for m in (1, 2)])
        result = index.identify(doc([]), ["uccyq"])
        self.assertEqual((result["slug"], result["status"]), (None, "contradiccion"))

    def test_explicit_responsible_is_used_but_shared_responsible_cannot_decide(self):
        target = doc([])
        index = ServiceIndex([], owners={"uccyq": ["Responsable@example.org"]})
        self.assertEqual(index.identify(target)["slug"], "uccyq")
        index = ServiceIndex([], owners={"uccyq": ["responsable@example.org"], "uco": ["responsable@example.org"]})
        self.assertIsNone(index.identify(target)["slug"])

    def test_inference_and_photos_are_not_training_evidence(self):
        references = [doc(["Fantasia"], "uco", month=m) for m in (1, 2)]
        references[0]["source"]["departmentBy"] = "remitente"
        references[1]["flags"] = ["foto"]
        result = ServiceIndex(references).identify(doc(["Fantasia"]))
        self.assertEqual((result["slug"], result["matched"], result["senderPeriods"]), (None, 0, 0))

    def test_unknown_and_doubtful_names_do_not_get_filled_in(self):
        target = doc(["Desconocido"])
        before = copy.deepcopy(target)
        result = ServiceIndex([], STAFF).identify(target)
        self.assertIsNone(result["slug"])
        self.assertEqual(target, before)
        self.assertEqual(people({"photoPeople": {"2026-10-01": [["Perez", "", True]]}}), [])

    def test_unread_calendar_can_be_assigned_without_creating_duties(self):
        target = {"id": "adjunto", "departments": [], "personHints": ["Centeno", "Esquivel", "Sin"], "reason": "formato desconocido"}
        ingest.resolve_unread([target], [], [{"id": "adjunto", "from": "nuevo@example.org"}], ServiceIndex([], STAFF))
        self.assertEqual(target["departments"], ["uccyq"])
        self.assertNotIn("shifts", target)
        self.assertEqual(target["reason"], "formato desconocido")


class PdfObject(dict):
    def get_object(self):
        return self

    def get_data(self):
        return self["data"]


class ScannedPdfTest(unittest.TestCase):
    def test_scanned_pdf_without_specific_consent_does_not_extract_or_send(self):
        with patch("pathlib.Path.read_text", return_value='{"attachments":[]}'), patch.object(ingest, "scanned_pdf_images") as extract:
            result = ingest.read_scanned_pdf(ingest.APP_ROOT / "guardias.pdf", {"sha256": "hash", "subject": "Guardias octubre", "date": "Mon, 26 Oct 2026 10:00:00 -0300"})
            self.assertIn("autorización", result["reason"])
            extract.assert_not_called()

    def test_course_attachment_is_not_sent_to_schedule_ai(self):
        with patch.object(ingest, "scanned_pdf_images") as extract:
            result = ingest.read_scanned_pdf(ingest.APP_ROOT / "curso.pdf", {"subject": "Solicitud de becas para el curso PARES Trauma", "date": "Mon, 26 Oct 2026 10:00:00 -0300"})
            self.assertIn("no corresponde", result["reason"])
            extract.assert_not_called()

    def test_original_jpeg_is_extracted_without_pillow_and_largest_image_wins(self):
        small, large = b"\xff\xd8\xff" + b"a" * 21000, b"\xff\xd8\xff" + b"b" * 41000
        resources = PdfObject({"/XObject": PdfObject({
            "/Stamp": PdfObject({"/Subtype": "/Image", "/Filter": "/DCTDecode", "data": small}),
            "/Calendar": PdfObject({"/Subtype": "/Image", "/Filter": ["/DCTDecode"], "data": large}),
        })})

        class Page(PdfObject):
            @property
            def images(self):
                raise ImportError("Pillow not installed")

        reader = types.SimpleNamespace(pages=[Page({"/Resources": resources})])
        with patch.dict("sys.modules", {"pypdf": types.SimpleNamespace(PdfReader=lambda path: reader)}):
            self.assertEqual(ingest.scanned_pdf_images(ingest.APP_ROOT / "test.pdf"), [])
            self.assertEqual(ingest.scanned_pdf_images(ingest.APP_ROOT / "test.pdf", allow_embedded=True), [large])

    def test_nested_form_is_read_once_and_unrelated_stream_is_ignored(self):
        jpeg = b"\xff\xd8\xff image"
        resources = PdfObject({"/XObject": PdfObject({"/jpeg": PdfObject({"/Subtype": "/Image", "/Filter": "/DCTDecode", "data": jpeg})})})
        form = PdfObject({"/Subtype": "/Form", "/Resources": resources})
        resources["/XObject"]["/self"] = form
        resources["/XObject"]["/png"] = PdfObject({"/Subtype": "/Image", "/Filter": "/FlateDecode", "data": b"other"})
        self.assertEqual(ingest.embedded_jpegs(PdfObject({"/XObject": PdfObject({"/form": form})})), [jpeg])


if __name__ == "__main__":
    unittest.main()
