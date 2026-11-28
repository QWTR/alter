<!-- apk: 0.15.0 -->
<!-- electron: 44.11.5 -->
# ALTTER 0.21.1

## Nowości

- **VoiceStudio wbudowane w ALTTER:** Studio → Lektor → „Zainstaluj VoiceStudio”. ALTTER sam pobiera oficjalną wersję z GitHuba, sprawdza sumę kontrolną, instaluje ją bez kreatora w folderze danych ALTTER-a i uruchamia w tle — bez osobnego okna. Pełny interfejs VoiceStudio (klonowanie, biblioteka głosów, dubbing) otwiera się wewnątrz ALTTER-a. Przy nagrywaniu lektora (także przez agentów) VoiceStudio budzi się samo.
- Za pierwszym razem VoiceStudio raz pokazuje swoją konfigurację (pobiera Pythona i silnik mowy, kilka GB). Potem działa już tylko w tle.

## Poprawki

- **Gemini i myszka/klawiatura:** czaty z Gemini dostają teraz narzędzia ALTTER-a (sterowanie komputerem, media, zespół). Wcześniej Gemini odpowiadał, że ich nie ma, mimo włączonej opcji.
