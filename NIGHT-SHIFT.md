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

## Etap 7 — błąd dostawcy i podwójna wysyłka
- Odtworzenie w przeglądarce: dwa synchroniczne Enter przed aktualizacją React dawały DWA POST-y. Odpowiedź 503 usuwała szkic (error-before-results.json).
- Dodano natychmiastową blokadę per rozmowa i przywrócenie tekstu, gdy nie było zdarzenia meta potwierdzającego przyjęcie. Nowy szkic wpisany w międzyczasie nie jest nadpisywany.
- Po poprawce: JEDEN POST, widoczny błąd dostawcy, brak wiecznego busy, oryginalny tekst w polu do ponowienia (error-after-results.json).
- Błąd 503 i zdarzenia narzędzi są symulowane na granicy fetch/SSE. Nie wywołano rzeczywistego dostawcy AI.
- Następne: końcowy typecheck/build, powtórka sąsiednich ścieżek i raport.

## Odbiór — końcowe sprawdzenie

- `npm test`: **10/10 OK** (w tym 4 dotychczasowe testy).
- `npm run typecheck`: **OK**.
- `npm run build:web`: **OK**. Ostrzeżenie: główny bundle około 1,44 MB, gzip 463 KB; optymalizacja ładowania pozostaje osobnym zadaniem.
- `git diff --check`: **OK**.
- Ostatnia powtórka w Edge: `after`, `workspace-skills`, `media-after`, `error-after`, `page` — wszystkie OK, brak wyjątków JavaScript. Tour objął 24 widoki i osiem zakładek workspace.
- API: status 200; podgląd skilla bez uwierzytelnienia 401; nieistniejący skill przy zapisie agenta workspace 400.
- Osobny serwer testowy: `127.0.0.1:4317`, PID 18188 w chwili odbioru. Dane: `G:\ALTTER-Repair\altter-plan-test-data`.
- Caddy 3232, relay 7340, Repair 17268 — te same PID-y co na początku. Nie restartowano ich ani nie zmieniano konfiguracji stron. Nie było push, publikacji wydania ani wdrożenia produkcyjnego.

### Co kliknąć

1. Na VPS otwórz `http://127.0.0.1:4317`.
2. Workspace → projekt `Night shift workspace…` → Agenci → `Night shift skill demo` → Stałe instrukcje → Edytuj. Zobacz przypisany `webapp-testing`; rozwiń „Dodaj skill z GitHuba”, wyszukaj repo lub wklej adres, wybierz paczkę, obejrzyj instrukcje i pliki. Po instalacji kliknij **Zapisz**, aby zachować przypisanie.
3. Czaty → `Local page preview demo` → przycisk podglądu `page-demo.html` → „Wskaż element”. Można wskazać nagłówek; zmieniony plik jest widoczny po odświeżeniu podglądu.
4. Studio → galeria wyników → `night-vroom.mp4` lub WAV. `night-vroom-project.mp4` ma przycisk powrotu do projektu.
5. Wpisz szkic wiadomości, przejdź na inny ekran i wróć. Szkice są osobne dla rozmów, projektów i zadań agenta; zapis w sesji tej karty przeglądarki, bez synchronizacji między urządzeniami.

### Gałąź i commity

Katalog: `G:\ALTTER-Repair\altter-plan`, gałąź `codex/altter-plan`.

- `94cabc5` — komendy narzędzi i rozwijanie szczegółów.
- `b4d6164` — szkice rozmów.
- `7247357` — paczki GitHub z podglądem i SHA.
- `b5872cd` — utrata i powrót sieci.
- `bee4348` — skille w workspace i szkice zadań agenta.
- `ccfb41e` — odtwarzanie audio, galeria i przykłady lokalnych wyników.
- `9ff654f` — blokada podwójnego wysłania i odzyskanie tekstu po odrzuceniu.

### Uruchomienie obok obecnej wersji

```powershell
& 'G:\ALTTER-Repair\altter-plan\scripts\start-night-shift.ps1'
```

Skrypt sprawdza port 4317, ustawia wyłącznie dla swojego procesu `ALTER_HOME` i startuje lokalny serwer. Zależności i build są już przygotowane. Po kolejnych zmianach źródeł frontendu uruchom `npm run build:web` w tej kopii. Zamknięcie testowego procesu nie wymaga zmiany Caddy ani zadań produkcyjnych.

### Dowody i ograniczenia

- Zrzuty, JSON-y, metadane filmu: `G:\ALTTER-Repair\altter-plan-artifacts`.
- Film: `G:\ALTTER-Repair\altter-plan-test-data\workspace\renders\night-vroom.mp4`.
- Przykłady źródeł: `examples/night-shift/`; scenariusze przeglądarkowe: `scripts/night-shift-browser.cjs`. Harness korzysta z Edge i istniejącego modułu `G:\servervroom\node_modules\ws`; uruchamia osobny profil oraz port CDP 9340. Nie jest testem dla dowolnego komputera bez tych narzędzi.
- Rzeczywisty skill pobrano z publicznego GitHuba i potwierdzono jego obecność w kontekście agenta oraz trwałość po restarcie. **Nie wykonano zadania przez rzeczywisty model AI**. Zdarzenia narzędzi i awaria dostawcy były symulowane, aby nie zużywać usług AI.
- HTML był przygotowany deterministycznie, a edycja wykonana bezpośrednio w pliku podczas testu. Przepływ generowania i edycji przez model pozostaje do sprawdzenia.
- MP4 renderowano rzeczywiście lokalnie. Audio AAC i odtwarzanie potwierdzono technicznie; nie oceniono odsłuchowo lektora. Materiał ma syntetyczny podkład WAV, bez polskiej mowy i bez zewnętrznych modeli głosu.
- Pierwszy ekran onboardingu obejrzano; konfigurację fixture zakończono przez API. Nie przeprowadzono pełnego łączenia kont AI przez onboarding.
- Nie parowano telefonu, nie testowano fizycznego urządzenia ani płatnych dostawców. Nie wykonano pełnego audytu każdej funkcji aplikacji.

Końcowy odczyt produkcji (bez zmian): relay HTTPS 200 / ok=true, Repair HTTPS 200 / ok=true, VROOM /api/posts?limit=1 HTTP 200.

Kontrola skryptu startowego wykryła niezgodność UTF-8 bez BOM z Windows PowerShell 5.1 (polskie znaki w komunikacie). Komunikat zmieniono na ASCII; ponowne uruchomienie skryptu kończy się kodem 0 i rozpoznaje działający port bez tworzenia drugiego procesu.

## Rozszerzenie — katalog skilli w ustawieniach (2026-11-28)
- Nowa zakładka: Ustawienia → Skille, adres #/settings?tab=skills. Wyszukiwarka znajduje się nad polecanymi repozytoriami, również na małym ekranie.
- Polecane źródła z nazwami i opisami PL/EN: https://github.com/anthropics/skills , https://github.com/openai/skills , https://github.com/vercel-labs/agent-skills . To wybór redakcyjny, nie deklaracja bieżącego rankingu gwiazdek.
- Rzeczywisty podgląd potwierdził paczki: Anthropic 20, OpenAI 44, Vercel 9. Bez instalowania całych repozytoriów: wybór SKILL.md, podgląd instrukcji i plików, instalacja wskazanej paczki w bibliotece ALTTER-a.
- Zainstalowano frontend-design bezpośrednio przez nowy ekran (firstInstall=true w catalog-first-install-results.json). Źródło zapisane z SHA e4bb5d960d87126ff3b3a8af1a104b7db67560ba; po reloadzie nadal w bibliotece i przy edycji agenta.
- Istniejące paczki są oznaczone jako zainstalowane, również przy podaniu alternatywnego linku tree/blob. W edytorze agenta można wybrać już zainstalowaną paczkę bez kolejnego pobierania. Instalacja z ustawień nie zmienia automatycznie instrukcji wszystkich agentów.
- Bufor drzew GitHub: gałąź 5 min, SHA 1 h, maksymalnie 64 wpisy; preview i install korzystają z tego samego zatwierdzonego drzewa. Test chroni przed ponownym pobieraniem drzewa dla wyboru paczki i instalacji.
- Testy przeglądarkowe: rzeczywiste wyszukiwanie (8 wyników), instalacja, odświeżenie, wykrycie duplikatu, widoczność w edytorze agenta, symulowany błąd GitHub z komunikatem i odblokowaniem formularza. Brak wyjątków JS. Sąsiedni przepływ workspace-skills nadal OK.
- Szerokości 360/390/768/1440 bez overflow; catalog-*.png i catalog-results.json w katalogu artefaktów. Tabs w ustawieniach przewijają wybraną zakładkę po ustaleniu uprawnień lokalnego użytkownika.
- Weryfikacja: npm test 11/11, npm run typecheck OK, npm run build:web OK (dotychczasowe ostrzeżenie o dużym bundlu), git diff --check OK.
- Zrestartowano wyłącznie serwer testowy 4317 (PID 18040) w celu załadowania cache backendu. Caddy 3232, relay 7340, Repair 17268 bez restartu. Produkcji nie wdrażano; brak push i płatnych operacji.
