# Asiakaskatsauksen analyysityökalut

Katsaus noudattaa referenssiesityksen 80/20-periaatetta. Asiakkailla on yhteinen
laskenta, lähdemerkinnät ja tulkintarajat. Agentti valitsee pyynnön ja rajauksen
mukaan olennaiset näkökulmat. Tulokset tukevat tarinaa aiemmasta arvosta
seuraaviin yhdessä sovittaviin toimiin.

## Aineiston kartoitus

Synteettisen lähdetyökirjan 19 välilehteä sisältävät kolme asiakasta, 34
toimipaikkaa, neljä pesulaa, kuusi tuotetta, 1 248 käyttö- ja vaikutusriviä
kummassakin taulussa, 3 635 korjausriviä ja 16 415 kirjattua palvelukiertoa.
Kuukausittaisen erittelyn avain on asiakas, toimipaikka, pesula, tuote ja
kuukausi. Varannot kuvaavat jakson viimeistä kuukautta, tapahtumat koko jaksoa.
Pesuloiden resurssi- ja jäterivit ovat pesula-kuukausitasolla. Asiakkaalle
kohdistetut luvut tulevat vaikutustaulusta, jotta pesulan koko kulutusta ei
kirjata asiakkaalle.

| Speksin näyttöalue | Käytettävä näyttö | Tarvittava lisäaineisto |
| --- | --- | --- |
| Asiakkuuden onnistuminen | Kattavuus, käytön ja palvelun signaalit, KAMin sopimusmittarit dashboardilla | Sovitut tavoitteet ja asiakkaan vahvistama kokonaisarvio |
| Asiakaskokemus | Kirjattujen palvelupyyntöjen määrä taustatietona | CSAT, NPS, palautteiden sisältö ja ratkaisut |
| Palvelun suorituskyky | Kirjatut kierrot, mediaani, P90 ja myöhästymisliput | Sopimuksen tavoite, toimitusten perusjoukko ja poikkeamien käsittely |
| Palvelun käyttö | Kohdistetut ja skannatut tekstiilit, tuote- ja toimipaikkajakauma | Uniikit käyttäjät, toteutunut käyttö ja saatavuus |
| Operatiivinen arvo | Pesut, korjaustapahtumat, skannauspoikkeamat ja korjausskenaariot | Todennetut lykätyt hankinnat ja mitattu tuoteikä |
| Taloudellinen arvo | KAMin erikseen merkitsemä arvio | Hinnat, laskutus, toteutuneet kulut ja hyväksytty vertailujakso |
| Vastuullisuusarvo | Kohdistettu vesi, energia, pesun ja toimitusten päästöt sekä jätereittijakauma | Varmennetut päästörajaukset ja koko elinkaaren tiedot |
| Kehittäminen | Jaksoerot ja tarkistuskohteet, joiden taustaluku näkyy | Toimenpideloki, omistajat, määräajat ja vaikutuksen seuranta |
| Yhteistyön tulevaisuus | Asiakaskohtaiset agendanostot ja näyttöön perustuvat kysymykset | Asiakkaan kanssa sovitut päätökset ja seurantamittarit |

`active_wearers` esiintyy tuotetasolla. Samaa henkilöä ei voi tunnistaa eri
riveiltä, joten lukuja ei summata uniikeiksi käyttäjiksi. Pyyntölukujen
kuukausikoosteesta ei voi päätellä pyyntöjen syitä, ratkaisuja tai
pyynnöttömiä päiviä. `Industry_Priorities` ohjaa painotusta. Se ei todenna
hygieniaa, turvallisuutta tai sääntelyn noudattamista.

## Agentin työkalut

| Työkalu | Tulos ja laskentaperuste |
| --- | --- |
| `coverage` | Rajauksen toimipaikat, kuukausirivit, detaljin ja kiertojen kattavuus sekä puuttuva näyttö. |
| `adoption` | Viimeisen kuukauden tekstiilikanta ja skannausosuus. Tuotetason pesutiheys jakaa jaksopesut kuukausiallokaatioiden summalla. |
| `service` | Kirjattujen kiertojen määrä, mediaani, nearest-rank P90, myöhästymisosuus ja palvelupyynnöt. |
| `operations` | Pestyt kilot, pesut, korjaukset ja korjaukset per 100 pesua. Korjausskenaariot käyttävät lähteen 0/50/100 prosentin oletuksia. |
| `footprint` | Vesi, energia, prosessi- ja toimituspäästöt, pestyä kiloa kohti lasketut intensiteetit sekä jätereitit. |
| `baselines` | Kolme pesumallia samalla pestyllä kilomäärällä. Ero on vertailumalli miinus toteuma. |
| `period` | Samanpituinen edeltävä jakso samoilla toimipaikka- ja maarajauksilla. Skannausosuuden muutos on prosenttiyksikköinä. |
| `drivers` | Kuukausipäästöt, maakohtaiset vesi-, päästö- ja korjaussummat sekä enintään kuusi suurinta päästöosuutta. |
| `laundry` | Asiakkaalle kohdistettu volyymi ja jalanjälki pesuloittain. Enintään kuusi suurinta pesulaa pestyn kilomäärän mukaan. |
| `actions` | Skannausvajeesta ja pitkistä kirjatuista kierroista johdetut tarkistuskysymykset. |
| `peer` | Projektiin annetun neljän verrokin painottamaton päästöintensiteetin keskiarvo. Yritysten liikevaihtoon perustuva vertailu näytetään erillään asiakkaan luvuista, ja sen rajaus on vahvistamaton. |

Työkalut palauttavat rajauksen, lähteen, taulut, tilan, mahdollisen
varantokuukauden ja tulkintarajan. Puuttuva tulos ja nollanimittäjä näkyvät
puuttuvina. Kattavuuden läpäisy osoittaa rakenteen ja sisäisen täsmäytyksen.
Se ei varmista aineiston ulkopuolisia väitteitä.

NorthStarin kontrolliluvut täsmäävät lähdetyökirjan `Sample_Output`-tauluun.
Paikallispesun vesiero on lähteessä 1 406 482,60 litraa. Laskenta antaa
1 406 482,75 litraa, kun kerrointa sovelletaan koko jakson pestyyn painoon.
Vertailu sallii alle 0,20 litran eron valmiin lähdesumman ja uudelleenlaskennan
välillä.

## Agentin käyttö

Käytä esimerkiksi pyyntöä **“Analysoi Suomen huhti–kesäkuun päästöt ja vertaa
edeltävään jaksoon”** tai **“Näytä Ruotsin palvelukierrot ja pisimmät P90-ajat”**.
Agentti valitsee enintään kolme nimettyä työkalua. Palvelin validoi ensin
ehdotetun rajauksen, ajaa laskennan ja antaa tulokset agentin viimeiseen
rakenteiseen vastaukseen. Viimeinen muutos voi avata analyysin vain samalla
aineistorajauksella. Keskustelu säilyttää lyhyen kuittauksen. Luvut ja
tarkistuskysymykset näkyvät Tutki dataa -välilehdellä.

Kaksivaiheinen analyysi käyttää samaa 90 sekunnin aikarajaa molemmille kutsuille.
Tavalliset muokkauspyynnöt käyttävät yhtä kutsua. HTTP-sopimukseen ei lisätty
kenttiä tai reittejä. Uudet työkalut ja mallin valinta pysyvät palvelimen
sisäisinä.
