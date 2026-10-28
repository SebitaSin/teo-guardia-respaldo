import unittest
from imap_sync import classify_guardia, safe_suffix, run_schedule_requests


class ImapSyncTests(unittest.TestCase):
    def test_requires_guardia_term_and_service(self):
        self.assertTrue(classify_guardia("Cronograma UCCyQ", "", ["septiembre.xlsx"])[0])
        self.assertFalse(classify_guardia("Factura", "UCCyQ", ["factura.pdf"])[0])
        self.assertFalse(classify_guardia("Cronograma", "sin servicio", ["archivo.pdf"])[0])

    def test_normalizes_accents(self):
        relevant, services = classify_guardia("Modificación guardia", "Diagnóstico por Imágenes", [])
        self.assertTrue(relevant)
        self.assertIn("diagnostico por imagenes", services)

    def test_suffix_is_bounded(self):
        self.assertEqual(safe_suffix("parte.XLSX"), ".xlsx")
        self.assertEqual(safe_suffix("../../sin-extension"), ".bin")
        self.assertEqual(safe_suffix("mal.12345678901"), ".bin")

    def test_requests_only_after_complete_mail_and_catalog_read(self):
        calls = []
        def runner():
            calls.append(True)
            return {"status": "ok", "sent": 0}
        for status in ["partial", "failed", "blocked", "running"]:
            out = run_schedule_requests({"status": status, "catalog": {"read": 4}}, runner)
            self.assertFalse(out["enabled"])
        for catalog in [None, {}, {"status": "failed", "read": 0}]:
            out = run_schedule_requests({"status": "complete", "catalog": catalog}, runner)
            self.assertFalse(out["enabled"])
        self.assertEqual(calls, [])
        self.assertEqual(run_schedule_requests({"status": "complete", "catalog": {"read": 4}}, runner), {"status": "ok", "sent": 0})
        self.assertEqual(calls, [True])


if __name__ == "__main__":
    unittest.main()
