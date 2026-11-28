# ALTTER — nocna zmiana 2026-11-28

## Zasady i stan początkowy
- Kopia robocza: `G:\ALTTER-Repair\altter-plan`, gałąź `codex/altter-plan`.
- Punkt wyjścia aplikacji: `8b17b4f` (0.19.2); instrukcja `chang`: `4439041`.
- Git był czysty. Produkcja, relay, Repair i konfiguracja Caddy pozostają nietknięte.
- Osobny serwer: `127.0.0.1:4317`; dane: `G:\ALTTER-Repair\altter-plan-test-data`; telemetry wyłączone, brak kopiowania kluczy.
- Bez publikacji, push i płatnych wywołań.

## Etap 1 — aktywność narzędzi w czacie (w toku)
- Odtworzenie przyczyny w kodzie: `arg.slice(0, 60)` pokazuje ścieżkę do interpretera zamiast polecenia; czas nie ma ochrony przed zawijaniem.
- Cel: rozpoznawalna komenda, pełna treść dostępna klawiaturą i myszą, czas w jednym wierszu.
- Uruchomiono build bazowy i niezależny serwer testowy. Pierwszy start wykrył BOM w ręcznie utworzonym configu testowym; poprawiono wyłącznie ten plik.
- Następne: zrzuty bazowe, poprawka, regresja i sprawdzenie przeglądarkowe.

### Wynik etapu 1
- Regresja: 2/2 testy commandSummary; typecheck OK; build OK (istniejące ostrzeżenie o dużym bundlu).
- Przeglądarka Edge: przed/po 360, 390, 768, 1440 px; komendy rozróżnialne, brak poziomego overflow, pełna komenda rozwijana, brak wyjątków JS.
- Dowody: G:\ALTTER-Repair\altter-plan-artifacts\before-*.png i after-*.png oraz *-results.json. Zdarzenia SSE symulowane, bez AI.
- Następne: szkice per rozmowa i instalacja skilli z GitHuba.
