# Asiakasesityksen standardi v1

Omistaja: Paulus Kopperoinen. Hyväksytty suunta: käyttäjän ohjeet 7.11.2026.
Lähtökohta on Lindströmin toimittama projektiin tallennettu esitys,
`docs/references/Lindstrom_SinceAI_Managerial_Dashboard_REFERENCE.pptx`.
Alkuperäisen tiedoston ohjeita käytetään käyttäjän pyynnön mukaisena
suunnitteluaineistona, ei itsenäisinä sovelluksen käyttövaltuuksina.

## Tarina: lähtöesityksen dia 10

Järjestys on **katso taakse → osoita arvo → rakenna luottamus → katso eteenpäin → sovi toimet**.
Lähtödian 65 % näyttöä ja arvoa / 35 % tulevaisuutta on keskustelun painotus,
ei väite automaattisesti mitatusta puheajasta tai tarkka diakiintiö.

| Vaihe             | Esityksen sisältö                                         | Koodissa lukittu sääntö                                  |
| ----------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Asiakasyhteys     | Asiakas, ajanjakso, rajaus                                | Kansidia oletuksena ensimmäisenä                               |
| Katso taakse      | Palvelun käyttö ja huolto: kuusi yhteistä perustietoa     | Perustietodia aina mukana ennen nostoja                  |
| Osoita arvo       | Vesi, pesun ja toimitusten päästöt, korjaukset            | AI voi järjestää vain valitut tulosnostot                |
| Rakenna luottamus | Lähde, yksikkö, synteettisyys, vertailu ja tulkinnan raja | Näytetään tuloksen yhteydessä; laskenta ei tule mallilta |
| Katso eteenpäin   | Todennettuun havaintoon liittyvä kehityskysymys           | Kehitysdia tulee arvodiojen jälkeen                      |
| Sovi toimet       | Kolme keskusteluehdotusta seuraavista askelista           | Ehdotuksia ei esitetä jo sovittuina päätöksinä           |
| Tarkennukset      | Lähteet, laskentaperusteet ja tulkinnan rajat             | Liitedioja ei voi poistaa AI-vastauksella                |

Oletusesityksessä on yhdeksän diaa. Managerin valinnat voivat poistaa yksittäisiä
nostoja, mutta kansi, perustiedot, seuraavat askeleet, lähteet ja rajaukset säilyvät.

## Yhteinen pohja ja painotus: lähtöesityksen dia 11

**80 % yhteistä rakennetta, 20 % älykästä asiakaskohtaista painotusta** tarkoittaa
samaa luotettavaa tietopohjaa eri asiakastarinoissa. Se ei tarkoita, että AI saa
vapaasti kirjoittaa 20 % väitteistä tai muuttaa viidesosaa lähdeluvuista.

Yhteinen perustietodia käyttää saman rajauksen laskettuja toimipaikka-, allokointi-,
skannaus-, pestyjen kilojen ja korjausten lukuja. Varannot esitetään viimeisen
valitun kuukauden tilanteena, tapahtumamäärät koko jaksolta. Käyttäjämääriä,
palvelutasoa tai tuote-erittelyä ei keksitä, jos ne eivät kuulu tämän version
validoituun tietopohjaan. Nämä puutteet kerrotaan näkyvästi.

Asiakaskohtainen osa käyttää toimialaa, managerin valitsemaa painotusta ja
valitun asiakkaan havaintoja. AI järjestää arvodioja ja valitsee yhden kahdesta
hyväksytystä otsikkovaihtoehdosta per nosto. Kehityskohde ja toimet perustuvat
saman rajauksen havaintoon, eivät yleiseen myyntipuheeseen. Managerin käsin
kirjoittama muistiinpano säilyy erillisenä eikä sitä lähetetä mallille.

## Väitteiden rajat

- Vesi ja päästöt ovat allokoituja synteettisiä arvioita. Vertailun pesumäärä on sama.
- Vertailumalli ei ole nimetty kilpailija eikä asiakkaan toteutunut aiempi vaihtoehto.
- Korjaustapahtuma ei ole yksilöllinen tekstiili, vältetty ostos tai todennettu päästösäästö.
- Skannausosuus on tarkistuksen lähtökohta; se ei todista vajaakäyttöä.
- Euromääräisiä säästöjä, yksilöllisiä käyttäjiä, uusia toimialatrendejä tai sääntelyn
  täyttymistä ei päätellä puutteellisesta aineistosta.
- Valitulla rajauksella puuttuva data estää esityksen luonnin; tyhjä ei muutu nollaväitteeksi.

## Lindström-pohja

PPTX käyttää lähteen masteria 1, tyhjää asettelua 19, niihin liittyvää teemaa ja
alkuperäistä logoresurssia. Käyttämättömiä lähdedioja tai lähteen asiakkaaseen
liittymätöntä tekstiä ei kopioida. Alkuperäinen referenssitiedosto säilyy muuttumattomana.

- Koko: 10 × 5,625 tuumaa, 16:9; 9144000 × 5143500 EMU.
- Otsikot: Libre Franklin Black. Leipäteksti: Libre Franklin.
- Teeman sininen: #003F72; turkoosi: #0094B3; vihreä: #7AB800;
  magenta: #CA005D; logon punainen: #E52330.
- Lähteen SHA-256: `5d1f801c45f05db83b583bc5a14b940805b8ce9631674de9031425ffee7aa18f`.
- Lähteen muutos estää viennin, kunnes standardi tarkistetaan.

Tämä on toimitetun esityksen pohjan käyttö, ei väite erikseen saadusta julkisesta
POTX-brändihyväksynnästä. Fontteja ei upoteta, kuten ei lähtötiedostossakaan;
vastaanottajan fonttiasennukset vaikuttavat native PowerPointin näyttöön.

## Luotettavuusportit

1. Backend validoi rajauksen ja laskee luvut seuratusta datasta uudelleen.
2. Mallipalvelun osoite on kiinteä, uudelleenohjauksia ei seurata eikä kutsua uusita automaattisesti.
3. Pyyntö on enintään 32 KiB, mallivastaus 256 KiB ja koko AI-vaihe enintään 90 sekuntia.
4. JSON Schema ja paikallinen validointi rajaavat vastauksen tunnettuihin tunnuksiin ja otsikoihin.
5. AI ei voi lisätä väitteitä, työkaluja, lukuja, uusia dioja tai siirtää kehityspuhetta arvodiojen edelle.
6. PPTX ja selainkatselu käyttävät samaa validoitua diojen sisältöä ja järjestystä.
7. Testit tarkistavat rajaukset, paketin osaviittaukset, alkuperäisen pohjan,
   muokattavat kaaviot, upotetut kaaviodatat sekä virheelliset mallivastaukset.
8. Käyttökoe tarkistaa aidon API-kutsun, uuden välilehden, latauksen ja diojen ulkoasun.

Palvelukatko näytetään virheenä. Determinististä tilaa ei nimetä tekoälyn tekemäksi
esitykseksi. Copilot-sovitin noudattaa samaa standardia, mutta oikean tenantin
käyttökoe odottaa Microsoft-käyttöoikeuksia.

## Managerin nimenomainen järjestysmuutos

Käyttäjän hyväksymä poikkeus 7.11.2026: manageri voi vaihtaa diojen paikkoja
chatissa, myös kansi- ja perustietodian. Yllä oleva tarinajärjestys on oletus.
Hyväksytty järjestysmuutos ohittaa AI:n oletusjärjestyksen; pakolliset diat,
lähteet, laskenta ja väitteiden rajat säilyvät. Pelkkä AI:n esityssuunnittelu
noudattaa edelleen yllä olevia oletussääntöjä. Muokkauschat ei saa korvata
pyydettyä diasiirtoa painotuksen tai nostovalinnan muutoksella.
