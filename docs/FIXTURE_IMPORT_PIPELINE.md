# Vaihe 2: pysyvä tuontiputki projektin feikkidatalla

Omistaja: kopperoinenp. Toteutus: Codex, 2026-11-07. Käyttäjä hyväksyi vaiheen 2
projektin omalla feikkidatalla. Kirjautuminen jätetään aiemman rajauksen mukaisesti pois.
Tämä hyväksyntä kattaa alla kuvatut uudet prototyypin taulut ja rajapinnat.
Nykyiset katsaus-, apuri- ja esitysrajapinnat säilyvät yhteensopivina.

## Käyttö

Käynnistä `pnpm preview:shared`, valitse asiakas ja avaa **Muokkaa katsausta → Lisää asetuksia**.
**Shared customer data / Yhteinen asiakasdata** sisältää tuontipainikkeen ja viimeisimmän työn tilan.
Valitse **Import demo data / Tuo feikkidata**. Erillinen työntekijä tarkistaa
asiakkaan aineiston ja julkaisee sen yhteiseen tietokantaan.
Valitse valmistumisen jälkeen **Load published data / Lataa julkaistu data**.
KAM:n avoin katsaus tallennetaan ennen sivun uudelleenlatausta. Asiakasta ei vaihdeta.
Katselijaprofiili voi seurata tuonteja, mutta ei käynnistää niitä.

Sama aineisto tuodaan vain kerran: saman asiakkaan, lähteen, tarkistussumman ja
laskentaversion yhdistelmä palauttaa olemassa olevan työn myös eri KAM:lle.
Uusi aineisto syntyy muuttamalla projektin lähdeaineistoa ja käynnistämällä palvelin
uudelleen ennen seuraavaa tuontia. Tuonti korvaa tämän yhden lähteen asiakkaan koko
synteettisen aineiston; se ei lisää samoja kuukausirivejä vanhojen perään.

## Putki

1. Backend lukee käynnistyksessä validoidun projektin `data.js`-aineiston
   (`REVIEW_DATASET` voi osoittaa samaa sopimusta käyttävään paikalliseen testitiedostoon).
2. `source_customer_mapping` määrittää lähteen `project-fixture` tunnisteet.
   Nyt ulkoinen asiakastunnus on sama kuin sovelluksen tunnus. Puuttuvia tai muuttuneita
   tunnisteita ei arvailla eikä dataa kohdisteta selaimen antaman nimen perusteella.
3. Rajattu asiakaspaketti, kanonisen JSON:n SHA-256 ja lähteen kontrollisummat
   tallennetaan `data_imports`-tauluun samassa transaktiossa. Payload on pysyvä staging-erä.
   API-rooli ei voi lukea staging-payloadia eikä päivittää työn tilaa tai julkaistua dataa.
4. Erillinen Node-prosessi käyttää rajattua työntekijäroolia ja hakee jonosta töitä
   `FOR UPDATE SKIP LOCKED` -lukituksella. Tässä pienessä prototyypissä PostgreSQL
   toimii sekä pysyvänä jonona että transaktionaalisena outboxina; erillistä viestipalvelua ei tarvita.
5. Työntekijä tarkistaa uudelleen tuontioikeuden ja tunnistekartoituksen. Se validoi
   rakenteen, asiakas-/toimipisteviitteet, rivien yksikäsitteisyyden, numeeriset arvot,
   tuotetason ja kuukausisummien vastaavuuden sekä palvelukierrot nykyisellä validaattorilla.
   Se vertaa tarkistussummaa ja kontrollisummia sekä olemassa olevan laskentamallin tuloksia.
6. Julkaisu päivittää `customer_datasets`-taulun, aktiivisen version, muuttumattoman
   `dataset_versions`-julkaisuraportin ja työn `ready`-tilan yhdessä transaktiossa.
   Puolivalmista dataa ei näy. `customer_reviews`-tauluun ei kosketa.

Kontrollit kattavat asiakkaan, toimipisteiden, kuukausirivien, tuotetason rivien ja
palvelukiertojen määrät sekä analyysivuoden pesukappaleet, korjaukset, veden ja pestyt kilot.
Koko lähde-erä, myös vertailuhistoria, kuuluu tarkistussummaan. Historiavuoden rivejä ei
summata analyysivuoden mittareihin. Vaatemäärä lasketaan nykyisen mallin joulukuun
snapshotista; sitä ei summata kuukausien yli. Raportti säilyttää laskentaversion ja lähteen.

## Häiriöt ja rinnakkaisuus

- Prosessin/yhteyden kuolema peruuttaa avoimen transaktion ja vapauttaa rivin.
  Työ pysyy jonossa ja seuraava työntekijä voi jatkaa sitä. Jonot ovat tietokannassa,
  eivät API-prosessin muistissa.
- Asiakaskohtainen transaktiolukko estää saman asiakkaan yhtäaikaiset julkaisut.
  Monotoninen työn järjestysnumero estää vanhaa työtä korvaamasta uudempaa julkaisua;
  tällainen työ saa tilan `superseded`.
- Validaatiovirhe tallentuu `failed`-tilaan ja turvalliseen virheraporttiin. Edellinen
  julkaisu säilyy käytössä. Sama virheellinen erä ei luo loputtomasti uusia töitä.
- Tunnistetut tilapäiset tietokantavirheet yrittävät enintään kolme kertaa kahden sekunnin
  viiveellä. Yhteyden katketessa koko transaktio voi peruuntua ennen yrityksen kirjaamista:
  tällöin työ jää jonoon palvelimen toipumista varten. Prosessisilmukka odottaa sekunnin.
- Validaatiovirheen korjaus vaatii korjatun lähde-erän tai ylläpitäjän tutkimuksen;
  epäonnistuneen työn nollaamiseen ei ole käyttäjän retry-rajapintaa tässä vaiheessa.
- Työntekijärooli saa käsitellä koko prototyypin jonoa, mutta ei katsauksia tai käyttäjäprofiileja.
  Sen yhteysosoite ei mene API-prosessille tai selaimelle.

## Uudet rajapinnat

Toimivat vain PostgreSQL-prototyypissä ja noudattavat sen paikallista saman alkuperän
tarkistusta sekä demoprofiilin asiakasoikeuksia. Demoprofiilin valinta ei ole tunnistautuminen.

| Pyyntö                                | Vastaus                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/customers/{id}/imports` | Ei bodya. Kiinteä `project-fixture`-liitin. `202 {job,duplicate:false}` tai saman erän tapauksessa `200 {job,duplicate:true}`. |
| `GET /api/v1/customers/{id}/imports`  | Viimeiset 20 työtä, `activeVersion` ja julkaistun aineiston `updatedAt`.                                                       |
| `GET /api/v1/jobs/{uuid}`             | Asiakasoikeuksien rajaama työn metadata, raportti ja virhe; ei staging-payloadia. Tuntematon/piilotettu työ `404`.             |

Työ sisältää `id`, `customer_id`, `source_id`, `checksum`, `calculation_version`,
`status`, `attempts`, `created_at`, `updated_at`, `report`, `error`.
Tilat: `queued`, `ready`, `failed`, `superseded`. Työ on muiden lukijoiden näkökulmasta
jonossa myös käsittelyn aikana, kun työntekijän transaktio pitää rivin lukossa.
Lukuoikeudeton asiakas ja tuonti ilman muokkausoikeutta palauttavat `403`.
Tietokannan häiriössä palautetaan `503`; tiedostoa ei käytetä varajulkaisuna.

Ulkoinen tietokanta: alusta skeemat `setupPrototype`-toiminnolla ja aja erikseen
`node scripts/import-worker.mjs`, jonka `IMPORT_DATABASE_URL` osoittaa työntekijärooliin.
Paikallinen `preview:shared` hoitaa migraatiot ja kummankin prosessin käynnistyksen.

## Rajaus seuraaviin vaiheisiin

Tuonti tallentaa kontrolliraportin ja julkaisee aineistoversion. Vaiheen 3
[mittariputki](DASHBOARD_METRICS.md) laskee dashboardin rajatut tulokset samasta aineistosta.

Alustava demodata lisätään edelleen bootstrapissa vain puuttuville asiakkaille, jotta
prototyyppi toimii ennen ensimmäistä putken kautta tehtyä julkaisua. Käyttöliittymä
kertoo tämän erikseen. Käynnistys ei ylikirjoita aiempaa julkaisua.

Suurten tiedostojen objektivarasto, CSV/XLSX-lähetykset, mielivaltaiset tunnistekartoitukset,
ajastetut ulkoiset lähteet, normalisoidut faktataulut ja säilytyspolitiikka ovat jatkotyötä.
Staging säilyttää nyt kokonaisen pienen asiakaspaketin JSONB-muodossa; tämä ei ole
satojen gigatavujen raakatiedostojen tallennusratkaisu. Nykyinen apurin tiedostolataus
on erillinen tilapäinen toiminto, ei tämän pysyvän tuontiputken liitin.

## Hyväksymiskokeet

`pnpm test:shared` testaa oikealla PostgreSQL:llä idempotenssin, eri käyttäjien oikeudet,
rinnakkaiset työntekijät, lukitun työn ohittamisen, kesken jääneen transaktion palautumisen,
rikkinäisen tarkistussumman, kontrollien poikkeaman, vieraan toimipisteen hylkäyksen,
julkaisun atomisuuden, uudemman version suojauksen sekä KAM:n katsauksen säilymisen.
`node --test tests/fixture-import.test.mjs` vertaa kaikkien kolmen feikkiasiakkaan
kontrolleja nykyiseen laskentamalliin ja varmistaa kanonisen tarkistussumman.

### Toteutuksen tarkistukset 2026-11-07

- Yleiset Node-testit: 123 hyväksyttyä, PostgreSQL-integraatiokoe ohitettu tässä ajossa.
- Erilliset PostgreSQL-testit: 16 hyväksyttyä sekä olemassa olevan palvelimen erillisessä
  testitietokannassa että täysin uuden paikallisen klusterin alustuksella.
- Ruff, ESLint, Prettier ja Node-testit: hyväksytty LF-rivinvaihdoilla tehdyssä
  erillisessä tarkistuskopiossa. Varsinaisessa Windows-työpuussa Ruffin muotoilutarkistus
  pysähtyi kahden aiemmin muuttamattoman Python-tiedoston CRLF-rivinvaihtoihin.
  Viimeisten käyttöliittymämuutosten jälkeen ESLint ja Prettier tarkistettiin uudelleen.
- Selain: Apexin feikkidatan tuonti valmistui, virheloki oli tyhjä, paneelin kieli vaihtui
  suomeksi ja julkaistun datan lataaminen palautti saman asiakkaan Tutki dataa -näkymän
  sekä tallennetun katsauksen.
- Muutoksia ei ole commitattu tai pushattu, eikä GitHubin CI:tä ole ajettu.
