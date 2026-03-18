/**
 * 1. Mérföldkő - Intelligens Tokenizáló és Normalizáló Motor
 */

const TokenState = {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    COMPLETED: 'COMPLETED'
};

/**
 * Magyar nyelvi normalizáló osztály
 */
class HungarianNormalizer {
    constructor() {
        // Gyakori rövidítések szótára (bővíthető)
        this.abbreviations = {
            "kb.": "körülbelül",
            "stb.": "s a többi",
            "pl.": "például",
            "dr.": "doktor",
            "u.": "utca",
            "db": "darab",
            "kft.": "korlátolt felelősségű társaság"
        };
        
        // Mértékegységek és rövidítéseik
        this.unitAbbreviations = {
            "ft": "forint",
            "db": "darab",
            "m": "méter",
            "km": "kilométer",
            "kg": "kilogramm"
        };
    }

    addAbbreviation(abbr, fullText) {
        this.abbreviations[abbr.toLowerCase()] = fullText;
    }

    normalize(original, clean) {
        let phonetic = original.toLowerCase();

        // 1. Speciális karakterek
        phonetic = phonetic.replace(/&/g, ' és ');
        phonetic = phonetic.replace(/%/g, ' százalék ');

        // 2. Rövidítések feloldása (pl. "kb." -> "körülbelül")
        if (this.abbreviations[phonetic]) {
            return this.abbreviations[phonetic];
        }
        // Próbáljuk a tisztított alakkal is megnézni, ha egy írásjel miatt nem találtuk (pl. "stb," -> "s a többi")
        if (this.abbreviations[clean + "."]) {
            return this.abbreviations[clean + "."];
        }

        // 3. Mértékegységek ragokkal (pl. Ft-ot -> forintot)
        // Kettébontjuk a szót a kötőjel mentén
        let parts = phonetic.split('-');
        if (parts.length === 2 && this.unitAbbreviations[parts[0]]) {
            // Egyszerűsített ragillesztés
            return this.unitAbbreviations[parts[0]] + parts[1];
        } else if (this.unitAbbreviations[clean]) {
            return this.unitAbbreviations[clean];
        }

        // 4. Számok és sorszámnevek átalakítása hangalakká
        // Sorszámnév (pl. "1.", "2024.")
        if (/^\d+\.$/.test(phonetic)) {
            const num = parseInt(phonetic, 10);
            return this.numberToText(num, true);
        }

        // Ha tartalmaz számot, de nem tisztán (pl. "200-at") - bonyolultabb ragkezelés itt kivitelezhető lenne
        // Tiszta szám (pl. "2024")
        if (/^\d+$/.test(clean)) {
            return this.numberToText(parseInt(clean, 10), false);
        }

        // Kevert azonosító (pl. "200" az "200-at" belsejében)
        if (/\d/.test(clean)) {
            return clean.replace(/\d+/g, (match) => {
                return this.numberToText(parseInt(match, 10), false);
            });
        }

        return clean;
    }

    /**
     * Magyar számok szöveggé alakítása (1 millióig demonstrációs célból)
     */
    numberToText(num, isOrdinal = false) {
        if (num === 0) return isOrdinal ? "nulladik" : "nulla";
        if (num >= 1000000) return num.toString(); // Egyszerűsítés

        let result = "";
        let thousands = Math.floor(num / 1000);
        let remainder = num % 1000;

        if (thousands > 0) {
            if (thousands === 1 && num < 2000) {
                result += "ezer";
            } else {
                result += this.convertBelowThousand(thousands, false) + "ezer";
            }
            if (remainder > 0 && num > 2000) {
                result += "-";
            }
        }

        if (remainder > 0) {
            result += this.convertBelowThousand(remainder, isOrdinal, num);
        } else if (isOrdinal && remainder === 0 && thousands > 0) {
            result += "edik"; // pl. "kétezredik"
        }

        return result;
    }

    convertBelowThousand(num, isOrdinal, fullNum = num) {
        if (num === 0) return "";
        
        const ones = ["", "egy", "kettő", "három", "négy", "öt", "hat", "hét", "nyolc", "kilenc"];
        const onesOrdinalExact = ["", "első", "második", "harmadik", "negyedik", "ötödik", "hatodik", "hetedik", "nyolcadik", "kilencedik"];
        const onesOrdinalSuffix = ["", "egyedik", "kettedik", "harmadik", "negyedik", "ötödik", "hatodik", "hetedik", "nyolcadik", "kilencedik"];
        const tens = ["", "tíz", "húsz", "harminc", "negyven", "ötven", "hatvan", "hetven", "nyolcvan", "kilencven"];
        const tensPrefix = ["", "tizen", "huszon", "harminc", "negyven", "ötven", "hatvan", "hetven", "nyolcvan", "kilencven"];
        const tensOrdinal = ["", "tizedik", "huszadik", "harmincadik", "negyvenedik", "ötvenedik", "hatvanadik", "hetvenedik", "nyolcvanadik", "kilencvenedik"];

        let h = Math.floor(num / 100);
        let t = Math.floor((num % 100) / 10);
        let o = num % 10;

        let res = "";

        // Százasok
        if (h > 0) {
            res += ones[h] + "száz";
        }

        // Ha kerek tizes vagy százas sorszámnév (pl. századik, huszadik)
        if (t === 0 && o === 0) {
            if (isOrdinal && h > 0) return res + "adik";
            return res;
        }

        // Tízesek
        if (t > 0) {
            if (o === 0) {
                if (isOrdinal) return res + tensOrdinal[t];
                return res + tens[t];
            } else {
                res += tensPrefix[t];
            }
        }

        // Egyesek
        if (o > 0) {
            if (isOrdinal) {
                if (fullNum === o) {
                    res += onesOrdinalExact[o]; // "első", "második" (ha csak egyjegyű a teljes szám)
                } else {
                    res += onesOrdinalSuffix[o]; // "huszonegyedik", "tizenkettedik"
                }
            } else {
                res += ones[o];
            }
        }

        return res;
    }
}

/**
 * Fő Tokenizáló Osztály
 */
class Tokenizer {
    constructor(customAbbreviations = {}) {
        this.normalizer = new HungarianNormalizer();
        // Lehetőség egyedi rövidítések hozzáadására
        for (const [abbr, fullText] of Object.entries(customAbbreviations)) {
            this.normalizer.addAbbreviation(abbr, fullText);
        }
    }

    /**
     * Végrehajtja a szöveg tokenizálását.
     * @param {string} text A bejövő nyers szöveg
     * @returns {Array} Az elkészült adatstruktúra
     */
    tokenize(text) {
        const tokens = [];
        // Regex: szétválasztjuk a whitespace-t a szavaktól, megőrizve az eredeti formát
        const regex = /([\s]+)|([^\s]+)/g;
        let match;
        let index = 0;
        let position = 0;

        while ((match = regex.exec(text)) !== null) {
            const whitespace = match[1];
            const word = match[2];

            if (whitespace) {
                tokens.push({
                    type: 'whitespace',
                    original: whitespace,
                    metadata: { length: whitespace.length, position: position }
                });
                position += whitespace.length;
            } else if (word) {
                const clean = this.cleanWord(word);
                const phonetic = this.normalizer.normalize(word, clean);

                tokens.push({
                    type: 'word',
                    original: word,
                    clean: clean,
                    phonetic: phonetic,
                    index: index++,
                    state: TokenState.PENDING,
                    metadata: {
                        length: word.length,
                        position: position
                    }
                });
                position += word.length;
            }
        }
        return tokens;
    }

    /**
     * Eltávolítja az írásjeleket és kisbetűsíti a szót
     */
    cleanWord(word) {
        // Alapvető írásjelek eltávolítása a szó végéről vagy elejéről
        return word.replace(/^[\.,!\?/:;"'\(\)\[\]\{\}]+|[\.,!\?/:;"'\(\)\[\]\{\}]+$/g, '').toLowerCase();
    }

    /**
     * Visszakereshetőség - Szöveg alapján megkeresi a legvalószínűbb tokent
     * a megadott listában.
     * @param {Array} tokens A teljes token lista (Return of tokenize())
     * @param {string} text A keresett szó
     */
    getTokenByText(tokens, text) {
        if (!text || text.trim() === '') return null;
        
        const searchClean = this.cleanWord(text);
        const searchPhonetic = this.normalizer.normalize(text, searchClean);

        // 1. Pontos egyezés a tisztított vagy a normalizált(fonetikus) alakra
        let match = tokens.find(t => t.type === 'word' && (t.clean === searchClean || t.phonetic === searchPhonetic));
        if (match) return match;

        // 2. Részleges egyezés (ha a keresett szó részben tartalmazza, vagy fordítva)
        match = tokens.find(t => t.type === 'word' && (t.clean.includes(searchClean) || searchClean.includes(t.clean)));
        return match || null;
    }
}

// Kompatibilitás felkészítése böngészőre (window) és Node.js-re (module.exports)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Tokenizer, TokenState, HungarianNormalizer };
} else if (typeof window !== 'undefined') {
    window.Tokenizer = Tokenizer;
    window.TokenState = TokenState;
    window.HungarianNormalizer = HungarianNormalizer;
}
