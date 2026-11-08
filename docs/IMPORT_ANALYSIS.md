# Aineiston tuontianalyysi

Valitse chatbotin työkaluvalikosta **Lisää tiedostoja** ja valitse enintään 50 tiedostoa.
Paina **Analysoi tiedostot**. Jonon eteneminen näkyy chatissa ja tiedostokohtaiset
raportit asiakaskatsauksen **Tuodut tiedostot** -osiossa. Epäonnistunut tiedosto
ei pysäytä jonoa. Uusi tuontierä korvaa kyseisen asiakkaan edelliset raportit
avoimessa selainvälilehdessä. Jokainen tiedosto analysoidaan erikseen.
Palvelin ei tallenna alkuperäistä tiedostoa tai raporttia pysyvästi.
Tunnetut asiakasnimi- ja tunnussarakkeet tarkistetaan valittua asiakasta vasten.
Tunnistetun toisen asiakkaan aineisto hylätään ennen analyysiä. Puuttuva tai
tuntematon tunniste sallitaan, ja raportti kertoo, että asiakasyhteys jäi varmistamatta.

Paikallinen tuontikomento käynnistää analyysin heti, kun sille annetaan tiedosto.
Se tukee UTF-8-CSV:tä, taulukkomuotoista XLSX:ää ja JSON-objektia, jossa
avaimet ovat taulujen nimiä ja arvot riviobjektien listoja. Excelissä ensimmäinen
rivi on otsikkorivi. Vuosivertailu tunnistaa kuukaudet muodossa YYYY-MM.

```powershell
node scripts/analyze-import.mjs DEMO .\asiakkaan-aineisto.csv
node --env-file=.env scripts/analyze-import.mjs DEMO .\asiakkaan-aineisto.csv --share-schema
```

CSV- ja Excel-tuonti tarvitsevat Python 3:n. Aseta tarvittaessa `PYTHON`
osoittamaan Pythonin suoritustiedostoon. Tulos on paikallinen JSON-raportti
`.local/imports/<asiakas>/<aineistoversio>.json`.

## Laadun vähimmäistaso

- Paikallinen profiili näyttää rivimäärän, täsmälleen toistuvat rivit,
  saraketyypit, puuttuvat arvot ja yksiselitteisten luku- ja kuukausisarakkeiden
  vaihteluvälin. Se toimii ilman AI-avainta.
- Työkalu tarvitsee vähintään kolme riviä. Tunnistettu tunniste, puuttuva
  tai sekoittunut laskentasarake, duplikaatit tai mahdoton suhdeluku estävät
  kyseisen laskennan. Muut taulut ja kelvolliset sarakkeet voivat valmistua.
- Vuosivertailu tarvitsee samat kuukaudet ja vähintään kolme riviä kummaltakin
  puolelta. Puuttuva vertailu ei muutu nollaksi. Kolme riviä on demon
  vähimmäisraja, ei tilastollisen merkitsevyyden osoitus.
- Työkalumäärittely, laskennan lähdesarakkeet, tarkistukset, hylkäyssyyt ja
  aineistoversio jäävät raporttiin. Tuonti ei korvaa aktiivista demoaineistoa.

## Tiedonkäsittely ja toteutuksen rajaus

Käsittele yksi asiakas per tuonti. Käyttäjä antaa asiakastunnisteen ja vastaa
aineiston rajauksesta. Tuonti torjuu useita arvoja yleisissä asiakastunnistekentissä,
mutta ei tunnista luotettavasti jokaista mahdollista asiakassaraketta.
Oletuksena tietoja ei lähetetä palveluntarjoajalle. Vain erillisellä
`--share-schema`-valinnalla nykyinen AI-adapteri saa kelvollisten sarakkeiden
otsikot, tyypit ja paikalliset tunnisteet. Tarkista, etteivät otsikot sisällä
henkilötietoja tai muuta aineistoa, jota ei saa lähettää.

Malli voi ehdottaa enintään kahdeksan yhden taulun summaa tai prosenttiosuutta.
Se ei suorita koodia, yhdistele tauluja eikä valitse tiedostopolkuja. Laskenta
ja valintarajat ovat sovelluksessa. Hyväksytyistä vuosivertailuista raportti
voi nostaa enintään kolme poikkeamaa. Rajat ovat 20 % tai osuuksille
5 prosenttiyksikköä. Ehdotus ohjaa selvittämään syyn, koska muutos ei yksin
osoita syytä tai säästöä. Liiketoimintamittarin merkitys vaatii tarvittaessa
aineiston omistajan vahvistuksen.

Selaimen tuonti käyttää paikallista reittiä
`POST /api/imports/{customer}?format=csv|xlsx|json&shareSchema=0|1`.
Pyyntö sisältää tiedoston tavut (`application/octet-stream`, enintään 8 MiB).
Vastaus on sama analyysiraportti kuin komentorivillä. Reitti käsittelee yhden
tuonnin kerrallaan. Muiden HTTP-reittien sopimukset säilyvät.
Tuodut työkalut näkyvät raportissa. Jos käyttäjä sallii skeeman jakamisen ja
asiakastunniste täsmää, analyysiharnessi voi muodostaa tiedoston sarakkeista
uuden validoidun laskentatyökalun. Tiedosto säilyy palvelimen muistissa enintään
30 minuuttia. Suodatukset edellyttävät vastaavia aika-, maa- tai
toimipaikkasarakkeita. Katso [analyysiharnessin rajat](ASSISTANTS.md).
