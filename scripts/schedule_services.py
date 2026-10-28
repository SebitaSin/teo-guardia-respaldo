"""Identifica un servicio con historia del remitente y personas, sin llamadas externas.

Los nombres de referencia salen de la nómina y de cronogramas con servicio explícito.
Una asignación inferida nunca se usa para enseñarse a sí misma la respuesta.
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher

VERSION = 1
STOP = set("DR DRA DOCTOR DOCTORA MEDICO MEDICA MEDICOS LIC BIOQ TEC ENF KINE SR SRA HS HRS HORAS DE DEL LA LOS LAS EL Y O GUARDIA GUARDIAS PASIVA PASIVO ACTIVA ACTIVO REFUERZO REEMPLAZO LICENCIA VACACIONES FERIADO TURNO MANANA TARDE NOCHE SIN DATO NOMBRE APELLIDO CRONOGRAMA SERVICIO HOSPITAL TOTAL LUNES MARTES MIERCOLES JUEVES VIERNES SABADO DOMINGO ENERO FEBRERO MARZO ABRIL MAYO JUNIO JULIO AGOSTO SEPTIEMBRE OCTUBRE NOVIEMBRE DICIEMBRE DUDOSO".split())


def words(value: object) -> tuple[str, ...]:
    text = unicodedata.normalize("NFD", str(value or "")).upper()
    text = "".join(char for char in text if not unicodedata.combining(char))
    return tuple(sorted(set(word for word in re.findall(r"[A-Z]{2,}", text) if word not in STOP)))


def email(value: object) -> str:
    found = re.search(r"[\w.+-]+@[\w.-]+", str(value or ""))
    return found.group(0).lower() if found else ""


def people(doc: dict) -> list[tuple[str, ...]]:
    """Cada nombre legible vota una vez; sus 31 turnos no son 31 médicos."""
    candidates = set()
    photo = doc.get("photoPeople")
    if isinstance(photo, dict):
        lines = [str(row[0]) for rows in photo.values() for row in rows if row and not (len(row) > 2 and row[2])]
    else:
        lines = [str(shift.get("text") or "") for shift in doc.get("shifts") or []] + list(doc.get("personHints") or [])
    for line in lines:
        for part in re.split(r"[·;\n/]+|\s+[yY]\s+", line):
            value = words(part)
            if value and any(len(word) >= 4 for word in value):
                candidates.add(value)
    # Un apellido abreviado y su nombre completo no cuentan como dos personas.
    return sorted(value for value in candidates if not any(set(value) < set(other) for other in candidates))


def trusted(doc: dict) -> bool:
    return bool(doc.get("departments") and doc.get("shifts") and not doc.get("source", {}).get("departmentBy") and "foto" not in doc.get("flags", []))


class ServiceIndex:
    def __init__(self, documents: list[dict], staff: dict | None = None, owners: dict | None = None):
        self.person_services = defaultdict(set)
        self.aliases = defaultdict(set)
        self.sender_events = defaultdict(lambda: defaultdict(set))
        self.owners = defaultdict(set)
        staff = staff or {}
        for slug, members in (staff.get("services") or {}).items():
            for person in members:
                name, surname = person.get("name") or "", person.get("surname") or ""
                if not set(words(surname)).issubset(words(name)):
                    name = f"{surname} {name}"
                self.add_person(name or surname, slug, surname)
        for variant, canonical in (staff.get("aliases") or {}).items():
            targets = self.aliases.get(words(canonical), set())
            if targets:
                self.aliases[words(variant)].update(targets)
        # Se deduplican adjuntos repetidos y revisiones del mismo mes.
        seen = set()
        for doc in documents:
            if not trusted(doc) or doc.get("id") in seen:
                continue
            seen.add(doc.get("id"))
            for slug in doc["departments"]:
                for person in people(doc):
                    self.add_person(" ".join(person), slug)
                sender = email(doc.get("source", {}).get("sender"))
                period = (doc.get("year"), doc.get("month"))
                if sender:
                    self.sender_events[sender][slug].add(period if all(period) else (doc.get("id"),))
        for slug, addresses in (owners or {}).items():
            if isinstance(addresses, list):
                for address in addresses:
                    if email(address):
                        self.owners[email(address)].add(slug)

    def add_person(self, name: object, slug: str, surname: object = None) -> None:
        value = words(name)
        if not value:
            return
        exact = self.aliases.get(value, set())
        person_id = next(iter(exact)) if len(exact) == 1 else value
        self.person_services[person_id].add(slug)
        self.aliases[value].add(person_id)
        if surname and words(surname):
            self.aliases[words(surname)].add(person_id)

    def match(self, value: tuple[str, ...]) -> tuple[object, set[str]]:
        ids = self.aliases.get(value)
        if not ids:
            scores = []
            for alias, candidates in self.aliases.items():
                if len(value) >= 2 and set(value).issubset(alias):
                    score = 0.98
                elif len(value) == len(alias):
                    ratios = [SequenceMatcher(None, left, right).ratio() for left, right in zip(value, alias)]
                    score = sum(ratios) / len(ratios) if min(ratios, default=0) >= 0.8 else 0
                else:
                    continue
                if score >= 0.88:
                    scores.append((score, candidates))
            if scores:
                best = max(score for score, _ in scores)
                ids = set().union(*(candidates for score, candidates in scores if score >= best - 0.04))
        ids = ids or set()
        slugs = set().union(*(self.person_services[person_id] for person_id in ids)) if ids else set()
        identity = next(iter(ids)) if len(ids) == 1 else ("ambiguous", value)
        return identity, slugs

    def identify(self, doc: dict, context: list[str] | None = None) -> dict:
        votes = defaultdict(float)
        matched = total = 0
        identities = set()
        for name in people(doc):
            identity, slugs = self.match(name)
            if identity in identities:
                continue
            identities.add(identity)
            total += 1
            if slugs:
                matched += 1
                for slug in slugs:
                    votes[slug] += 1 / len(slugs)
        ranked = sorted(votes.items(), key=lambda item: (-item[1], item[0]))
        person_slug, count = ranked[0] if ranked else (None, 0)
        share = count / total if total else 0
        margin = (count - (ranked[1][1] if len(ranked) > 1 else 0)) / total if total else 0
        people_strong = bool(person_slug and count >= 2 and share >= 0.6 and margin >= 0.25)
        sender = email(doc.get("source", {}).get("sender"))
        sender_counts = {slug: len(events) for slug, events in self.sender_events.get(sender, {}).items()}
        ordered = sorted(sender_counts.items(), key=lambda item: (-item[1], item[0]))
        sender_slug, sender_count = ordered[0] if ordered else (None, 0)
        sender_total = sum(sender_counts.values())
        sender_share = sender_count / sender_total if sender_total else 0
        sender_strong = bool(sender_slug and sender_count >= 2 and sender_share >= 0.8)
        owner = self.owners.get(sender, set())
        if len(owner) == 1:
            sender_slug, sender_strong = next(iter(owner)), True
        context = set(context or [])
        result = {"version": VERSION, "slug": None, "status": "insuficiente", "method": None,
                  "people": total, "matched": matched, "majority": round(share, 3), "margin": round(margin, 3),
                  "candidates": [{"slug": slug, "votes": round(value, 3)} for slug, value in ranked[:3]],
                  "senderService": sender_slug, "senderPeriods": sender_count, "senderShare": round(sender_share, 3)}
        if people_strong and sender_strong and person_slug != sender_slug:
            result["status"] = "contradiccion"
        elif sender_strong and context and sender_slug not in context:
            result["status"] = "contradiccion"
        elif people_strong:
            result.update(slug=person_slug, status="asignado", method="remitente_y_medicos" if person_slug == sender_slug else "mayoria_medicos")
        elif person_slug and share >= 0.5 and margin >= 0.25 and person_slug == sender_slug:
            result.update(slug=person_slug, status="asignado", method="remitente_y_medicos")
        elif sender_strong and (not context or sender_slug in context):
            result.update(slug=sender_slug, status="asignado", method="historial_remitente")
        elif len(context) == 1 and (not person_slug or person_slug in context):
            result.update(slug=next(iter(context)), status="asignado", method="contexto_correo")
        return result
