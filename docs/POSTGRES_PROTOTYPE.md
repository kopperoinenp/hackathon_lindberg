# Yhteinen PostgreSQL-prototyyppi ilman kirjautumista

Toteutus vastaa suunnitelman ensimmäisen vaiheen prototyyppirajausta: yhteinen
asiakasdata, käyttäjäkohtaiset katsaukset ja kokeiltavat asiakasoikeudet. Käyttäjän
pyynnöstä kirjautumista tai OIDC-palvelua ei ole toteutettu.

Vaiheen 2 [pysyvä feikkidatan tuontiputki](FIXTURE_IMPORT_PIPELINE.md) lisää
asiakaskohtaiset tuonnit, taustatyöntekijän, tarkistukset ja atomiset julkaisuversiot.
`preview:shared` käynnistää myös tämän työntekijän. Tuonti löytyy katsauksen lisäasetuksista.

## Käynnistys

```powershell
pnpm install
pnpm preview:shared
```

Käynnistys luo oikean paikallisen PostgreSQL-palvelimen, taulut, rajatun
tietokantaroolin ja synteettiset esimerkkiasiakkaat. Tietokanta kuuntelee vain
osoitteessa 127.0.0.1. Selainpalvelu käynnistyy oletuksena porttiin 4173 ja
PostgreSQL porttiin 54339. Sulje aiempi saman portin esikatselupalvelin ensin.
Pelkkä `pnpm preview` säilyttää aiemman tiedostotallennusversion.

Kehitysriippuvuus `embedded-postgres` sisältää paikallisen palvelimen. Paketin
alustakohtainen asennusskripti saattaa tarvita sallimisen paketinhallinnassa.
Windows-paketin sallinta on rajattu `pnpm-workspace.yaml`-tiedostossa. Klusteri
alustetaan UTF-8-merkistöllä myös Windowsissa. Prototyyppi ei asenna järjestelmäpalvelua.

Tiedot ja satunnaiset tietokantasalasanat ovat oletuksena hakemistossa
`.local/shared-prototype/`, jonka Git ohittaa. Käynnistyksen toistaminen ei
tyhjennä tietokantaa tai korvaa asiakkaiden jo tallennettuja tietoja. Salasanoja
ei tulosteta, eikä nykyistä `.env`-tiedostoa muuteta.

Valinnaiset asetukset:

| Muuttuja                | Käyttö                                                                         |
| ----------------------- | ------------------------------------------------------------------------------ |
| `PORT`                  | Selainpalvelimen portti                                                        |
| `PROTOTYPE_PG_PORT`     | Paikallisen PostgreSQL:n portti                                                |
| `PROTOTYPE_DB_DIR`      | Paikallisen klusterin ja sen asetusten hakemisto                               |
| `REVIEW_STORE=postgres` | Käytä PostgreSQL-adapteria suoraan esikatselupalvelimessa                      |
| `DATABASE_URL`          | Valmiiksi alustetun prototyyppitietokannan rajatun sovellusroolin yhteysosoite |

## Kokeile kahden KAM:n näkökulmasta

Sivun yläreunassa on **Prototyypin käyttäjä (ei kirjautumista)** -valitsin:

| Profiili                | Asiakkaat                | Oikeus   |
| ----------------------- | ------------------------ | -------- |
| Demo – kaikki asiakkaat | NorthStar, Apex, Mediora | Muokkaus |
| KAM A                   | NorthStar ja Apex        | Muokkaus |
| KAM B                   | Apex ja Mediora          | Muokkaus |
| Katselija               | Apex                     | Luku     |

1. Valitse KAM A ja avaa Apex. Lisää esimerkiksi muistiinpano tai säästöarvio.
2. Vaihda KAM B:hen. Apexin faktadata on sama, mutta KAM A:n oma katsaus ei näy.
3. Vaihda takaisin KAM A:han. Tallennetut muokkaukset palautuvat myös uudelleenlatauksessa.
4. KAM B:n asiakaslistassa ei ole NorthStaria. Myös suora API-pyyntö siihen estetään.
5. Katselijan muutoksia ei tallenneta. Myös tietokannan rivitason säännöt estävät kirjoituksen.

Valitsin tallentaa demoprofiilin HttpOnly-/SameSite-evästeeseen. Sen valinta on
tarkoituksella vapaa, joten kuka tahansa prototyypin käyttäjä voi valita myös kaikki
asiakkaat näyttävän profiilin. Tämä havainnollistaa valtuutusta, ei todenna henkilöllisyyttä.
Prototyyppiä ei pidä tarjota ulkoiseen verkkoon, ja `NODE_ENV=production` estää
tämän PostgreSQL-demotilan käynnistymisen. Tuotantokirjautuminen on erillinen vaihe.

## Tallennus ja tietojen erottelu

- `customer_datasets`: yksi synteettinen asiakasdatapaketti JSONB-muodossa per
  organisaatio ja asiakas. Yhteiset perustiedot ja käyttödata tulevat tietokannasta.
- `prototype_users` ja `customer_access`: demoprofiilit ja niiden asiakasoikeudet.
- `customer_reviews`: katsaus per organisaatio, asiakas ja KAM.
- `review_audit`: tallennusrevision tekijä ja ajankohta ilman muistiinpanon sisältöä.

Rivitason oikeudet (RLS) suodattavat tietokantahaut. API käyttää erillistä roolia,
joka ei omista tauluja eikä ohita RLS:ää. Käyttäjäkonteksti asetetaan
transaktiokohtaisesti, joten yhteyspooli ei jätä edellisen pyynnön oikeuksia voimaan.
Revision vertailu tehdään atomisesti tietokannassa, myös kahden palvelinprosessin välillä.

Selain saa vain valitun profiilin asiakkaiden aineiston. Myös laskentamoduulit ja
apurin asiakaskonteksti käyttävät pyyntökohtaista rajattua tietoa. Toisen asiakkaan
suoraa tunnusta, koodattua data.js-osoitetta tai esityksen arvaamatonta tunnusta
ei käytetä oikeustarkistuksen korvikkeena. Esitysvälimuisti ja lataukset erotetaan
myös omistajan mukaan. PostgreSQL-virheessä ei palata hiljaisesti paikallisiin tiedostoihin.

Nykyiset `.local/reviews`-tiedostot säilyvät. Niitä ei automaattisesti liitetä johonkin
nimettyyn demokäyttäjään, koska niiden alkuperäistä omistajaa ei tunneta.

## Rajapintalisäykset

- `GET /api/demo/session`: tallennustila, valittu demoprofiili, profiililuettelo,
  lukuoikeustila ja sallittujen asiakkaiden määrä. Tiedostotilassa `{enabled:false}`.
- `POST /api/demo/user`: `{user:"kam-a"}` vaihtaa demoprofiilin. Vaatii paikallisen
  saman alkuperän JSON-pyynnön; käyttäjä tunnistetaan tietokannan profiililistasta.
- Nykyisten review-reittien vastausmuoto ja revisionumerointi säilyvät.
  PostgreSQL-tilassa katsaukset ovat lisäksi käyttäjäkohtaisia.
- PostgreSQL-tilassa selain hakee [valmiit mittarit](DASHBOARD_METRICS.md).
  Vanha `data.js`-reitti palauttaa tilakoodin `410`.

## Testit ja rajaus

```powershell
pnpm test
pnpm test:shared
```

Tavallinen testiajo tarkistaa rajatun aineiston, pyyntökontekstien erottelun ja
tuotantotilan eston. `test:shared` käynnistää oikean PostgreSQL:n ja tarkistaa
jaetun datan, omat katsaukset, organisaatioiden erottelun, palvelimen uudelleenyhdistämisen,
kilpailevat tallennukset, SQL-tason kirjoituseston, selaimelle palautuvan aineiston,
esitysten omistajuuden ja evästeen vaihdon. Vaihtoehtoisesti testit voivat käyttää
muuttujalla `TEST_DATABASE_ADMIN_URL` annettua testipalvelinta ja luoda sinne oman
kertakäyttöisen testitietokannan. Älä osoita muuttujaa tuotantopalvelimeen.

Tämä vaihe ei vielä muuta synteettistä kuukausimallia yleiseksi tietovarastoksi.
Selain lataa edelleen sallitun demoasiakasjoukon ja laskee osan tunnusluvuista itse.
Tiedostotuonti ei tässä vaiheessa julkaise uutta yhteistä asiakasdataa: nykyiset
tuontiraportit ovat yhä tilapäisiä. Suurten aineistojen tuonti, taustalaskenta,
versioitu julkaisu, pysyvät PPTX-tiedostot ja rajattu dashboard-API kuuluvat seuraaviin vaiheisiin.

## Paikallisen testauksen tulos 2026-11-07

- Yleiset regressiotestit: 122 hyväksyttyä, yksi erikseen ajettava PostgreSQL-testi ohitettu.
- Oikealla PostgreSQL-palvelimella ajettava `test:shared`: kaikki 15 testiä hyväksytty.
- Koko Ruff-/ESLint-/Prettier-/Node-tarkistus hyväksytty erillisessä kopiossa, jossa
  Windowsin rivinvaihdot yhtenäistettiin. Varsinaisessa projektissa ei muotoiltu asiaan liittymättömiä tiedostoja.
- Selainkoe: KAM A näki vain NorthStarin ja Apexin, KAM B Apexin ja Medioran.
  Apexin oma otsikko tallentui KAM A:lle, puuttui KAM B:n katsauksesta ja palautui
  KAM A:lle myös uudelleenlatauksessa.
- GitHubiin lisätty PostgreSQL-testityö on valmisteltu; sitä ei ole ajettu paikallisen CI-palvelun kautta.
