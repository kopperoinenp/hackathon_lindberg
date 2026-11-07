# Seuraavat vaiheet: asiakkaan saama arvo ja seuraava yhteinen askel

Omistaja: Paulus Kopperoinen. Päivitetty 7.11.2026 käyttäjän pyynnöstä.
Lähde: `docs/references/Lindstrom_SinceAI_Managerial_Dashboard_REFERENCE.pptx`,
erityisesti diat 7–13. Dokumentin sisältöä käytetään tuotevaatimusten lähteenä.

## Mitä tehtävänanto tavoittelee?

Dian 10 tarina: **LOOK BACK → SHOW VALUE → BUILD TRUST → LOOK FORWARD → AGREE ACTIONS**.
Pelkkä ympäristömittaristo ei kata kokonaisuutta: account managerin pitää osoittaa
palvelun arvo ja valmistella asiakkaan kanssa sovittava tuleva kehitys.
Dian 11 periaate on 80 % yhteistä rakennetta ja 20 % asiakaskohtaista painotusta.
Dian 10 noin 65/35-painotus koskee toteutuneen arvon ja tulevan suunnan tasapainoa;
sitä ei tulkita mekaaniseksi diojen lukumääräkiintiöksi.

Nykyinen toteutus tarjoaa automaattisen katsauksen, rajatun data-analyysin,
veden/päästöjen/korjausten näytöt, tarkistettavan skannaushavainnon ja ehdotetut
jatkotoimet. Lähteet, oletukset ja rajat ovat näkyvissä. Selain ja natiivi PPTX
käyttävät samaa laskentaa. Käyttöliittymä säilytetään käyttäjän lukitsemassa muodossa.
AI-chat muokkaa sallittuja rajauksia ja sisältövalintoja ja kuittaa vain Valmis.
Tämä ei vielä kata kaikkia dian 11 yhteisen perustan mittareita.

## 1. Laajenna yhteistä tietopohjaa (diat 8, 11 ja 13)

Seuraava tärkein toteutus: selvitä lähdetaulujen avaimet ja kattavuus, sitten laajenna
nykyistä kuukausittaista toimipaikkakohtaista mallia. Prioriteetit:

- käyttäjät ja tekstiilien käyttö: yksilöitävät aktiiviset käyttäjät, tuotejakauma,
  käyttökierrot sekä asiakas → toimipaikka → tuote -tarkastelu;
- palvelu ja toimitukset: sovitut mittarit palvelun toimivuudelle ja toimituksille;
- elinkaaren loppu: uudelleenkäyttö, kierrätys, hyödyntäminen ja jäte.

Kaikkea lähdepaketin tietoa ei vielä tuoda frontendin fixtureen. Selvitä ensin,
mitkä mittarit voidaan johtaa paketista luotettavasti ja mille tarvitaan lisädataa.
Älä korvaa puuttuvaa mittaria arvauksella tai nollalla.
Hyväksymiskriteeri: jokaiselle näkyvälle luvulle lähdetaulu, kaava, yksikkö,
aikarajaus ja laatulippu; asiakassumma täsmää toimipaikkoihin ja alkuperäisiin riveihin.
Varantotietoa ei summata kuukausilta, käyttäjiä ei lasketa tuoterivien summana.

## 2. Tee tulevasta suunnasta sovittava (diat 7, 9 ja 10)

Muuta nykyinen yleinen jatkotoimilista ketjuksi:
havainto → tarkistettava kysymys → ehdotettu toimi → vastuuhenkilö → tavoite → seuranta.
Erota ehdotettu ja asiakkaan kanssa sovittu toimi. Näytä aluksi vain 1–3 tärkeintä.
Skannauspuute on selvityskohde, ei todistettu vajaakäyttö tai säästö.
Hyväksymiskriteeri: manageri pystyy valmistelemaan ja tallentamaan yhden selkeän
asiakaskohtaisen jatkotoimen, joka näkyy samalla tavalla katsauksessa ja esityksessä.

## 3. Asiakaskohtainen painotus ilman pakollista aloituslomaketta (dia 11)

Katsaus avautuu edelleen heti oletusversioon. Tallenna myöhemmin managerin chatissa
antama agenda, tavoitteet ja hyväksytyt painotukset asiakaskohtaisesti.
Toimialan oletukset ovat muokattavia ehdotuksia. Mahdolliset toimialatrendit ja
sääntelynostot tarvitsevat tarkistetun lähteen, päivämäärän ja soveltamisrajauksen.
Hyväksymiskriteeri: samasta tietopohjasta saa eri asiakkaille sopivan tarinan,
mutta yhteinen perusta, luvut ja lähteet säilyvät; asiakasvaihto ei siirrä vanhoja muistiinpanoja.

## 4. Varmista koko demopolku ja esitysten laatu (dia 12)

Testaa kolme asiakasta, oletuskatsaus, chatmuutos, tarkempi data, selain-esitys ja
ladattava PPTX. Varmista, että sama valinta ja laskennan tilanne näkyvät kaikissa.
Tarkista natiivilla PowerPointilla myös kaaviot, fontit ja tekstien mahtuminen.
PDF-tulostuksen asettelun tarkistus on vielä tekemättä. Lisää puuttuvan datan ja
API-virheen demot sekä chatin aikana vaihtuneen asiakkaan testi.
Hyväksymiskriteeri: account manager valmistaa palaverin ilman mittareiden etsimistä
ja saa luotettavan esityksen ilman teknistä vientiprosessia.

## 5. Copilot ja tuotantokäyttö erillisenä vaiheena

Nykyinen OpenAI-adapteri palvelee esityssuunnittelua ja muokkauschatia. Sisäinen
sopimus on palveluntarjoajasta riippumaton; Copilotin HTTP-rajapinta on erilainen.
Copilotin lisenssit, tenantin oikeudet ja todellinen integraatiotesti tarvitaan ennen
vaihtoa. Tunnistautuminen, käyttöoikeudet, asiakaskohtainen tallennus, auditointi ja
käyttöbudjetit suunnitellaan ennen monen käyttäjän tuotantopalvelua.
Ne eivät ole nykyisen paikallisen hackathon-demon valmiita ominaisuuksia.

## Tämän muutoksen rajaus ja hyväksyntä

Käyttäjä hyväksyi tässä chatissa AI:n kytkemisen sivun muokkaamiseen ja täsmensi,
että apuri tekee muutokset ja kuittaa lyhyesti, ilman keskusteluvastauksia.
Toteutus: `backend/review-chat.mjs`, yhteinen AI-adapteri, paikallinen API,
nykyisen frontendin chat ja rajatut testit. Uusi rajapinta: [CHAT_API.md](CHAT_API.md).
Uusia frameworkeja, tietokantaa tai pakollista aloitusvaihetta ei lisätty.
