/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   story.js – texty príbehu (scenár)
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Všetky vety, ktoré hráč číta, sú na jednom mieste ako scenár filmu:
 *  prológ v knihe, rozhovor so záhradníkom, spomienky v zväzkoch kresieb,
 *  rozhovor s babkou pri bráne a epilóg. Hráč je oslovovaný v 2. osobe
 *  a vety sú volené tak, aby nezáležalo na rode hráča.
 * =============================================================================
 */

export const STORY = {
    /** Prológ – ľavá strana knihy; odseky sa „píšu“ ceruzkou. */
    prologue: {
        chapter: 'Kapitola prvá',
        heading: 'Kniha',
        paragraphs: [
            'Celé leto ležala na stole kniha v koženej väzbe. Babka Elena do nej kedysi kreslila záhradu – bludisko zo živých plotov uprostred dediny, ktoré sama vysadila.',
            '„Kto sa do kresby pozerá dosť dlho,“ hovorievala, „ten v nej nájde cestu.“',
            'V ten večer vietor z okna prevrátil list. Z papiera zavoňala tráva.'
        ],
        caption: 'Dedina pri rieke. Uprostred bludisko, na jeho konci brána.'
    },

    /** Titulok kapitoly počas letu kamery do kresby. */
    titleCard: { over: 'Kapitola prvá', main: 'Záhrada' },

    /** Záhradník pri vstupnej bráne. */
    gardener: {
        name: 'Matej, záhradník',
        lines: [
            'Dobrý deň! Ty budeš Elenino vnúča, však? Ten pohľad by som spoznal hocikde.',
            'Ráno sa sem prihnal vietor a rozfúkal jej staré kresby po celom bludisku.',
            'Tri zväzky listov. Bez nich jej kniha nebude nikdy celá.',
            'Elena čaká na druhom konci, pri bráne k rieke. Ak sa cesta stratí, stlač H – ceruzka ti nakreslí smer.'
        ]
    },

    /** Spomienky zo zväzkov kresieb (v poradí, v akom ich hráč nájde). */
    pages: [
        '„Prvý ker som zasadila, keď som mala toľko rokov ako ty teraz. Bol menší ako môj klobúk.“',
        '„Tu sme s tvojím dedkom prvý raz tancovali. Spustil sa dážď a nikomu to nevadilo.“',
        '„Bludisko nie je na to, aby sa v ňom človek stratil. Je na to, aby sa naučil vrátiť domov.“'
    ],
    pageSource: 'zo zväzku kresieb babky Eleny',
    allPages: 'Všetky tri zväzky sú pokope. Elena čaká pri bráne k rieke.',

    /**
     * Myšlienky postavy v bludisku (bublina nad hlavou, hra pritom beží): pri studni,
     * stĺpe a záhone v zákutiach, v slepej uličke, po opakovanom náraze do plota
     * a pred výstupnou bránou, ak ešte chýbajú zväzky. Pri každej prekážke sa vyberie iná veta.
     */
    thoughts: {
        well: [
            'Studňa. Keď sa nakloním, na hladine vidím kúsok neba.',
            'Babka hovorievala, že do studne sa šepkajú priania. Tak teda… nech nájdem cestu.',
            'Z hĺbky je počuť kvapkanie. Táto voda je stará ako celá záhrada.'
        ],
        column: [
            'Kamenný stĺp. Niekto naň vyryl šípku – už ju takmer nevidno.',
            'Na stĺpe sú vryté písmená E a J. Elena… a dedko?',
            'Stĺp v slepej uličke. Kto ho sem postavil, chcel, aby si tu človek oddýchol.'
        ],
        planter: [
            'Okrúhly záhon. Zem je ešte vlhká – niekto ho dnes polieval.',
            'Nezábudky. Babka ich mávala na každom okne.',
            'Záhon uprostred bludiska. Ako malá záhrada v záhrade.'
        ],
        deadEnd: [
            'Slepá ulička. Nevadí – aspoň viem, kade nie.',
            'Tadiaľto to nepôjde. Vrátim sa k poslednej odbočke.',
            'Ticho. Iba vietor v živých plotoch.',
            'Zase stena. Bludisko sa so mnou hrá.'
        ],
        hedge: [
            'Živý plot je hustý ako múr. Treba hľadať priechod.',
            'Konáre škriabu. Skúsim to inokade.',
            'Cez plot sa neprebojujem. Kde je len tá cesta?'
        ],
        gate: ['Za bránou je rieka a babka. Zväzky ešte nemám všetky… vrátiť sa po ne?']
    },

    /** Úloha v rohu obrazovky. */
    objective: {
        search: 'Nájdi zväzky kresieb a príď k bráne pri rieke',
        gate: 'Choď k bráne pri rieke'
    },

    /** Babka pri výstupnej bráne – podľa toho, koľko zväzkov hráč priniesol. */
    grandma: {
        name: 'babka Elena',
        complete: [
            'Tak predsa! Všetky tri zväzky – vietor ich vrátil.',
            'Teraz je kniha znova celá. A na poslednej strane je miesto pre novú cestu.',
            'Poďme domov. Čaj už dávno vychladol.'
        ],
        partial: [
            'Tu si! Už som sa bála, že ťa bludisko nepustí.',
            'Listy, ktoré chýbajú, si vietor ešte chvíľu nechá. Vrátime sa po ne inokedy.',
            'Poďme domov. Čaj už dávno vychladol.'
        ]
    },

    /** Epilóg – ľavá strana knihy po návrate z kresby. */
    epilogue: {
        chapter: 'Epilóg',
        heading: 'Cesta domov',
        complete: [
            'Večer sme sedeli nad knihou. Elena vložila späť všetky tri zväzky a na poslednú stranu dokreslila novú cestu – tú, ktorá dnes viedla bludiskom.',
            'Kniha je celá. A predsa v nej zostalo dosť prázdnych strán.'
        ],
        partial: [
            'Večer sme sedeli nad knihou. Pár listov ešte chýbalo, no Elena sa len usmiala: „Niektoré cesty sa kreslia na dvakrát.“',
            'Na poslednú stranu dokreslila tú, ktorá dnes viedla bludiskom.'
        ]
    }
};
