# ALTTER 0.20.0

## Nowości

- **Ustawienia → Skille:** wyszukiwarka GitHuba, polecane repozytoria z opisami, podgląd paczek i instalacja w bibliotece ALTTER-a.
- Skille można przypisywać agentom również bezpośrednio w workspace. Instalacja zapisuje źródło i SHA; podgląd i instalacja nie uruchamiają obcych skryptów.
- Galeria Studio odtwarza pliki audio i pozwala wrócić z wyniku do jego projektu. Podgląd obsługuje klawiaturę i zamknięcie klawiszem Escape.

## Poprawki

- Aktywność agenta pokazuje właściwe polecenie zamiast samej ścieżki do PowerShella; pełną treść można rozwinąć, a licznik czasu pozostaje w jednym wierszu.
- Szkice rozmów i zadań agenta zostają po przejściu na inny ekran lub odświeżeniu karty.
- Szybkie dwukrotne naciśnięcie Enter nie wysyła dwóch żądań. Gdy serwer odrzuci wiadomość przed potwierdzeniem przyjęcia, jej tekst wraca do pola wiadomości.
- Utrata sieci jest widoczna, a powrót połączenia odświeża dane.

## Weryfikacja

- Testy repozytorium, typecheck i produkcyjny build frontendu.
- Przeglądarka: 360, 390, 768 i 1440 px; rzeczywista instalacja skilla z GitHuba, zapis przypisania i trwałość po odświeżeniu.
- Lokalny eksport MP4 1080×1920 z audio; odtwarzanie galerii i podgląd HTML.
- Odpowiedzi narzędzi AI i awarie dostawcy sprawdzano deterministycznie; rzeczywiste generowanie przez modele i polski lektor nie były częścią tych testów.

Instalator Windows ma wersję 0.20.0. Powłoka Android pozostaje w wersji 0.15.0; korzysta z interfejsu udostępnianego przez komputer.
