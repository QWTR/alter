<!-- apk: 0.15.0 -->
<!-- electron: 44.11.5 -->
# ALTTER 0.21.4

## Łączenie telefonu przez internet

- **„Połącz telefon” sam otwiera szybki link internetowy.** Kod QR prowadzi tylko przez ten link, a nie przez adres w sieci domowej (192.168…). Telefon łączy się na Wi-Fi i na danych komórkowych, nie musi być w tej samej sieci co komputer.
- **Kod i QR odnawiają się same.** Gdy kod wygaśnie po 5 minutach, od razu pojawia się nowy. Jeśli link się zerwał, otwiera się ponownie. Licznik pokazuje, kiedy będzie następny kod.
- Gdy telefon się połączy, kod sam się zamyka.
- Gdy linku nie da się otworzyć, ALTTER pisze to wprost: kod zadziała wtedy tylko w tej samej sieci Wi-Fi.
- Aplikacji na telefon nie trzeba aktualizować.

## Poprawki

- **Zakładki w Ustawieniach nie są już ucinane.** Na szerokim oknie układają się w dwa wiersze. Na wąskim przewijają się tylko tyle, ile trzeba, a zanikanie przy krawędzi pokazuje, że dalej są kolejne.
