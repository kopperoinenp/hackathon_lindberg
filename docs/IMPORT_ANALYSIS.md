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
Se tukee UTF-8-CSV:tä (pilkku, puolipiste tai sarkain), XLSX-työkirjoja ja
JSON-objektia, jossa avaimet ovat taulujen nimiä ja arvot riviobjektien listoja.
Excelistä luetaan nimetyt taulukot tai etsitään sarakeotsikot välilehden alusta.
Selvästi erotetut taulukot voidaan lukea samalta välilehdeltä. Excelin
päivämäärä- ja prosenttimuotoilut tunnistetaan. Kaavoista luetaan tallennettu
arvo, jos sellainen on mukana. Päivämäärille käyvät myös `YYYY-MM`,
`YYYY-MM-DD` ja `D.M.YYYY`. Epäselvät asettelut kannattaa rajata nimetyiksi
Excel-taulukoiksi. Vanhat `.xls`-tiedostot ja usean rivin yhdistelmäotsikot
vaativat esikäsittelyn.

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
- Vuosivertailu tarvitsee samat kuukaudet, samat rivimäärät tunnistetuissa
  vertailuryhmissä ja vähintään kolme riviä kummaltakin puolelta.
  Puuttuva vertailu ei muutu nollaksi. Kolme riviä on demon
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

Paikalliset työkalut laskevat esimerkiksi summia, keskiarvoja ja ryhmiteltyjä
rivimääriä ilman mallipalvelua. Tuloksessa näkyvät käytetty taulu, rivimäärä
sekä tunnistetut kuukausi- ja kategoriaryhmittelyt. Malli voi ehdottaa enintään
kahdeksan yhden taulun työkalua. Käytettävissä ovat summa, osuus, keskiarvo,
minimi, maksimi ja rivimäärä.
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

## Testiaineistot

Kokeile selaimessa `tests/fixtures/imports/site-activity-fi.csv`-aineistoa.
Uusimman vuoden pyykkimäärä on 3 501 kg. Helsinki ja Tampere ovat avattavissa
omana erittelynään. Aineisto on synteettinen ja sen asiakasyhteys jää
varmistamatta, koska siinä ei ole asiakastunnistetta.

Toinen tuontiesimerkki on `tests/fixtures/imports/customer-operations.xlsx`.
Sen kahdelta välilehdeltä pitäisi löytyä 3 650 kg pestyä pyykkiä uusimmalta
vuodelta, vertailujaksolta 3 250 kg ja 15 palvelupyyntöä.

```powershell
node --test tests/import-analysis.test.mjs tests/import-workbook.test.mjs tests/preview.test.mjs
```

Testit luovat lisäksi XLSX-aineistoja, joissa on muun muassa raporttiotsikoita,
aukkoja, nimettyjä taulukoita ja virheellisiä soluja. Projektin olemassa olevan
moniasiakkaisen testityökirjan rivimäärät tarkistetaan erikseen lukijatasolla.
