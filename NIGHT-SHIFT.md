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

## Etap 2 — szkice
- Commit etapu 1: 94cabc5.
- Przed poprawką test w przeglądarce potwierdził pusty tekst po opuszczeniu czatu i po reloadzie (draft-before-drafts.json).
- Po poprawce oba scenariusze zachowują tekst (after-drafts.json); zapis w sessionStorage per rozmowa/projekt, bez wysyłania treści na serwer.
- Regresja draftStore 2/2, typecheck i build OK. Następne: skille GitHub.

## Etap 3 — skille z GitHuba
- Commit szkiców: b4d6164.
- Nowy przepływ: Agenci → karta agenta → Edytuj → Dodaj skill z GitHuba → wyszukiwanie/link → wybór paczki → podgląd → Zainstaluj i zaznacz → Zapisz.
- Rzeczywiste źródło: https://github.com/anthropics/skills/tree/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/webapp-testing . W repo odnaleziono 20 paczek; zapisano SKILL.md, LICENSE, examples i skrypt pomocniczy bez uruchamiania.
- Test UI: wyszukiwanie prawdziwych repo, wybór paczki, podgląd, instalacja, zapis przypisania. Zrzuty skills-360/390/768/1440.png, skills-results.json w katalogu artefaktów.
- Oddzielny proces Node potwierdził odczyt przypisania z bazy i włączenie instrukcji Playwright oraz ścieżki paczki do skillsText. Nie wywoływano AI; jakość wykonania zadania przez model nie jest jeszcze sprawdzona.
- Testy repo: 10/10, w tym stare skille, walidacja ścieżek, pin SHA i brak wykonania skryptu.
- Zabezpieczenia: tylko publiczny github.com HTTPS, brak kluczy GitHub, timeouty i limity rozmiaru, pomijane symlinki, bez git clone/hooków/npm. Podgląd instrukcji renderuje wyłącznie bezpieczny Markdown, bez aktywnych bloków zadań.
- Następne: restart wyłącznie instancji testowej, offline, przegląd workspace i Studio.

## Etap 4 — sieć i przegląd ekranów
- Commit skilli: 7247357.
- Poprawiono odświeżanie po online: wcześniej zależało od wcześniejszego ukrycia karty na ponad 3 s. Teraz powrót sieci zawsze odświeża cache API.
- Dodano komunikat offline w sześciu językach. CDP faktycznie odłączył sieć, wpisany tekst przetrwał; komunikat zniknął po połączeniu. Dowód: offline-390.png.
- Tour 24 widoków przy 360/390/768/1440: start, projekty, lista workspace, pusty i wypełniony projekt, Studio. Bez overflow i wyjątków JS. Osiem zakładek workspace otwarto również na desktopie (workspace-tab-*.png). Fixture: 8 zadań, dokument, rozmowa, długa nazwa.
- Studio zainstalowane wyłącznie w katalogu danych testowych; trwa lokalny eksport 6 s, 1080x1920, bez płatnych usług. Render ma jeden worker, syntetyczny podkład WAV; nie jest to test polskiego lektora.
- Następne: odczyt skilli po restarcie instancji testowej, weryfikacja MP4, podgląd HTML i końcowe checki.

## Etap 5 — agent wewnątrz workspace
- Commit sieci: b5872cd.
- Skille można wybrać i zainstalować również w Workspace → Agenci → agent → Stałe instrukcje → Edytuj. Właściciel zapisuje przypisania przez endpoint workspace; uprawnienia członków nie zostały rozszerzone.
- Walidowane są identyfikatory skilli. Dodano szkic zadania agenta zachowywany po zamknięciu panelu.
- Test przeglądarkowy przy 390 px: odznaczenie/zapis, zaznaczenie/zapis, ponowny odczyt z API, zamknięcie i ponowne otwarcie panelu ze szkicem. OK. Dowody workspace-skills-390.png, workspace-skills-results.json.
- Po rzeczywistym restarcie samej instancji testowej API nadal zwraca źródło i SHA e4bb5d960d87126ff3b3a8af1a104b7db67560ba oraz przypisanie skilla.
- Następne: zatwierdzenie poprawek galerii i wysyłki po błędzie.

## Etap 6 — galeria i lokalne wyniki Studio
- Odtworzono błąd audio w UI: galeria próbowała wyświetlać WAV jako img (media-before-audio.png). Naprawiono przez natywny odtwarzacz audio.
- Galeria obsługuje Enter/Spację, widoczne zamknięcie i Escape; wynik z folderu projektu prowadzi z powrotem do jego workspace.
- Test media-after: audio działa, MP4 odtwarza się (czas rośnie), 1080x1920, 6.058667 s; przejście do właściwego projektu i zamknięcie Escape OK; brak wyjątków JS.
- MP4: G:\ALTTER-Repair\altter-plan-test-data\workspace\renders\night-vroom.mp4 (H.264 + AAC 48 kHz stereo). Sprawdzono obie sceny w wyeksportowanych klatkach; powiększono tekst pomocniczy do 44 px i poprawiono kontrast. Audio syntetyczne, bez lektora i bez płatnych wywołań.
- Kod sceny: examples/night-shift/vroom-demo.tsx; odtworzenie: node scripts/night-shift-render.cjs (jeden worker).
- Podgląd strony: odpowiedź testowa → otwarcie prawdziwego HTML → wskazanie #hero-title → ręczna zmiana pliku w teście → odświeżenie pokazuje nowy nagłówek. Dowody page-picked.png, page-edited.png, page-results.json. Nie jest to test edycji przez model.
- Umiejętność użyta przy teście renderowania: Remotion (lokalny silnik).
