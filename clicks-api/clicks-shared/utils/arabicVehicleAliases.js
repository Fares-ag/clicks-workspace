/**
 * Arabic vehicle make/model aliases for legacy Excel cmodel values.
 * Normalizes common Gulf Arabic spellings to Hatla2ee catalog make/model names.
 */

function normalizeArabic(text) {
  return String(text || "")
    .replace(/[\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/([\u0600-\u06FF])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u0600-\u06FF])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Latin tokens embedded in Arabic strings */
const LATIN_MAKES = {
  gmc: "GMC",
  kia: "Kia",
  bmw: "BMW",
  byd: "BYD",
  mg: "MG",
  fj: "Toyota",
  toyota: "Toyota",
  mercedes: "Mercedes",
  "land rover": "Land Rover",
  jetour: "Jetour",
  van: "Other",
};

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return dp[n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

/** Normalize common misspellings before lookup */
function canonicalizeArabicPhrase(ar) {
  let s = ar;
  const rules = [
    [/لاند\s*ك[رو]+[vz][zr]+/g, "لاندكروزر"],
    [/لاند\s*ك[رة]+[zr]+/g, "لاندكروزر"],
    [/اتندكروزر/g, "لاندكروزر"],
    [/لاندروزر/g, "لاندكروزر"],
    [/لاندكروزر\s*شاص/g, "لاندكروزر"],
    [/لاندكروزر\s*بيك\s*اب/g, "لاندكروزر"],
    [/متسوبيشي/g, "ميتسوبيشي"],
    [/حمس/g, "جمس"],
    [/جيمس/g, "جمس"],
    [/جمسي/g, "جمس"],
    [/نبسان/g, "نيسان"],
    [/دودح/g, "دودج"],
    [/كادبلاك/g, "كاديلاك"],
    [/كديلاك/g, "كاديلاك"],
    [/بينتلي/g, "بنتلي"],
    [/ليكسز/g, "لكزس"],
    [/ليكزس/g, "لكزس"],
    [/لكوس/g, "لكزس"],
    [/جاقور/g, "جاكوار"],
    [/ليكزيس/g, "لكزس"],
    [/شنجان/g, "شانجان"],
    [/جقوار/g, "جاكوار"],
    [/غوكس/g, "جمس"],
    [/كيتور/g, "جيتور"],
    [/قولف\s*فاجن/g, "فولكس باسات"],
    [/فكس\s*فاجن/g, "فوكس"],
    [/jetour[\s\u0600-\u06FF]*/gi, "جيتور t2"],
    [/مريسيدس/g, "مرسيدس"],
    [/ام\s*دبليو/g, "بي ام"],
    [/سزوكي/g, "سوزوكي"],
    [/فلز\s*فجن/g, "فولكس"],
    [/مزيراتي/g, "مزيراتي"],
    [/ايسوزي/g, "ايسوزي"],
    [/شنيان/g, "شانجان"],
    [/جنيسيس/g, "جنيسيس"],
    [/^موديل\s+/, ""],
    [/^[\u0600-\u06FF]{2,8}\s+(?=تويوتا|تيوتا|تايوتا|لكزس|ليكزس|مرسيدs|مريسيدس)/, ""],
    [/old\s+mercedes/gi, "مرسيدس"],
    [/bmw/gi, "بي ام"],
    [/g80/gi, "g80"],
    [/تايوتا/g, "تويوتا"],
    [/لينكين/g, "لينكون"],
    [/mercedes/gi, "مرسيدس"],
    [/mercidece/gi, "مرسيدس"],
    [/land rover/gi, "لاند روفر"],
    [/toyota/gi, "تويوتا"],
    [/jetour/gi, "جيتور"],
    [/bmw/gi, "بي ام"],
    [/gmc/gi, "جمس"],
    [/kia/gi, "كيا"],
    [/van/gi, "فان"],
    [/شاص/g, "لاندكروزر"],
    [/فيلار/g, "فيلار"],
    [/سيلفرادو/g, "سلفرادو"],
    [/سانتافي/g, "سانتافيه"],
    [/سكوايا/g, "سكويا"],
    [/كamar/g, "كامارو"],
    [/كامارو/g, "كامارو"],
    [/كmaro/g, "كامارو"],
    [/راف\s*4/g, "راف4"],
    [/بي\s*ام/g, "بي ام"],
    [/جي\s*ام\s*سي/g, "جمس"],
    [/^م\s*ج(?:\s|$)/, "ام جي"],
    [/لاند\s*روفر/g, "لاند روفر"],
  ];
  for (const [re, rep] of rules) {
    s = s.replace(re, rep);
  }
  return s.replace(/^[\d٠-٩]+\s*/, "").replace(/\s+/g, " ").trim();
}

/** Arabic make token -> English make name */
const ARABIC_MAKES = {
  تويوتا: "Toyota",
  تيوتا: "Toyota",
  تايوتا: "Toyota",
  نيسان: "Nissan",
  مرسيدس: "Mercedes",
  لكزس: "Lexus",
  ليكزس: "Lexus",
  ليكسز: "Lexus",
  لكوس: "Lexus",
  هوندا: "Honda",
  كيا: "Kia",
  هيونداي: "Hyundai",
  مازدا: "Mazda",
  ماذدا: "Mazda",
  ميتسوبيشي: "Mitsubishi",
  متسوبيشي: "Mitsubishi",
  جمس: "GMC",
  حمس: "GMC",
  جيمس: "GMC",
  جمسي: "GMC",
  "جي ام سي": "GMC",
  شفروليه: "Chevrolet",
  شفر: "Chevrolet",
  شافرلي: "Chevrolet",
  فورد: "Ford",
  اودي: "Audi",
  بورش: "Porsche",
  جيلي: "Geely",
  جيتور: "Jetour",
  حيتور: "Jetour",
  جبتا: "Jetour",
  انفينيتي: "Infiniti",
  انفنتي: "Infiniti",
  انفينيتس: "Infiniti",
  دودج: "Dodge",
  دودح: "Dodge",
  كاديلاك: "Cadillac",
  كادبلاك: "Cadillac",
  كديلاك: "Cadillac",
  "ام جي": "MG",
  "م جي": "MG",
  امج: "MG",
  شانجان: "Changan",
  شانغان: "Changan",
  شيري: "Chery",
  بنتلي: "Bentley",
  بينتلي: "Bentley",
  "بي ام": "BMW",
  "بي ام دبليو": "BMW",
  جيب: "Jeep",
  جاكوار: "Jaguar",
  جاقور: "Jaguar",
  رينو: "Renault",
  فولكس: "Volkswagen",
  "فولكس واغن": "Volkswagen",
  سوزوكي: "Suzuki",
  ميني: "Mini",
  نبسان: "Nissan",
  سوبارو: "Subaru",
  بيجو: "Peugeot",
  تسلا: "Tesla",
  سانغيونغ: "SsangYong",
  جاك: "JAC",
  لينكون: "Lincoln",
  لينكين: "Lincoln",
  "لاند روفر": "Land Rover",
  هندا: "Honda",
  قولف: "Volkswagen",
  فاجن: "Volkswagen",
  شنجان: "Changan",
  ليكزيس: "Lexus",
  جقوار: "Jaguar",
  غوكس: "GMC",
  بورجوارد: "Borgward",
  كيتور: "Jetour",
  هونجي: "Hongqi",
  مزيراتي: "Maserati",
  ايسوزي: "Isuzu",
  جنيسيس: "Genesis",
  "ام دبليو": "BMW",
  مريسيدس: "Mercedes",
  سزوكي: "Suzuki",
  شنيان: "Changan",
  جك: "JAC",
};

const SORTED_LATIN_MAKES = Object.entries(LATIN_MAKES).sort(
  (a, b) => b[0].length - a[0].length
);

/** Arabic model phrase -> { make, model } */
const ARABIC_MODELS = {
  لاندكروزر: { make: "Toyota", model: "Land Cruiser" },
  "لاند كروزر": { make: "Toyota", model: "Land Cruiser" },
  كروزر: { make: "Toyota", model: "Land Cruiser" },
  باترول: { make: "Nissan", model: "Patrol" },
  بترول: { make: "Nissan", model: "Patrol" },
  فتك: { make: "Nissan", model: "Patrol" },
  باجيرو: { make: "Mitsubishi", model: "Pajero" },
  كامري: { make: "Toyota", model: "Camry" },
  كورولا: { make: "Toyota", model: "Corolla" },
  برادو: { make: "Toyota", model: "Prado" },
  التيما: { make: "Nissan", model: "Altima" },
  تاهو: { make: "Chevrolet", model: "Tahoe" },
  سلفرادو: { make: "Chevrolet", model: "Silverado" },
  "رنج روفر": { make: "Land Rover", model: "Range Rover" },
  "رانج روفر": { make: "Land Rover", model: "Range Rover" },
  روفر: { make: "Land Rover", model: "Range Rover" },
  هايلوكس: { make: "Toyota", model: "Hilux" },
  هايلكس: { make: "Toyota", model: "Hilux" },
  باثفندر: { make: "Nissan", model: "Pathfinder" },
  باثفاندر: { make: "Nissan", model: "Pathfinder" },
  اكورد: { make: "Honda", model: "Accord" },
  شيروكي: { make: "Jeep", model: "Cherokee" },
  لانسر: { make: "Mitsubishi", model: "Lancer" },
  سيراتو: { make: "Kia", model: "Cerato" },
  سبورتاج: { make: "Kia", model: "Sportage" },
  سورنتو: { make: "Kia", model: "Sorento" },
  فورتشنر: { make: "Toyota", model: "Fortuner" },
  ياريس: { make: "Toyota", model: "Yaris" },
  افالون: { make: "Toyota", model: "Avalon" },
  سكويا: { make: "Toyota", model: "Sequoia" },
  مورانو: { make: "Nissan", model: "Murano" },
  جوك: { make: "Nissan", model: "Juke" },
  جووك: { make: "Nissan", model: "Juke" },
  تيدا: { make: "Nissan", model: "Tiida" },
  ساني: { make: "Nissan", model: "Sunny" },
  سني: { make: "Nissan", model: "Sunny" },
  ماكسيما: { make: "Nissan", model: "Maxima" },
  ماكسيس: { make: "Nissan", model: "Maxima" },
  سنترا: { make: "Nissan", model: "Sentra" },
  ارمادا: { make: "Nissan", model: "Armada" },
  اكستيرا: { make: "Nissan", model: "Xterra" },
  اكستريل: { make: "Nissan", model: "XTrail" },
  كاشكاي: { make: "Nissan", model: "Qashqai" },
  كيكس: { make: "Nissan", model: "Kicks" },
  اورفان: { make: "Nissan", model: "Urvan" },
  "بيك اب": { make: "Nissan", model: "Pick up" },
  ريو: { make: "Kia", model: "Rio" },
  توسان: { make: "Hyundai", model: "Tucson" },
  سانتافيه: { make: "Hyundai", model: "Santa Fe" },
  اكسنت: { make: "Hyundai", model: "Accent" },
  الانترا: { make: "Hyundai", model: "Elantra" },
  النترا: { make: "Hyundai", model: "Elantra" },
  سييرا: { make: "GMC", model: "Sierra" },
  سيرا: { make: "GMC", model: "Sierra" },
  يوكون: { make: "GMC", model: "Yukon" },
  يوكن: { make: "GMC", model: "Yukon" },
  اكاديا: { make: "GMC", model: "Acadia" },
  تيران: { make: "GMC", model: "Terrain" },
  رانجلر: { make: "Jeep", model: "Wrangler" },
  ديفندر: { make: "Land Rover", model: "Defender" },
  رابتور: { make: "Ford", model: "F-150" },
  بايلوت: { make: "Honda", model: "Pilot" },
  سيتي: { make: "Honda", model: "City" },
  سيفيك: { make: "Honda", model: "Civic" },
  "سي ار في": { make: "Honda", model: "CR-V" },
  ماليبو: { make: "Chevrolet", model: "Malibu" },
  كروز: { make: "Chevrolet", model: "Cruze" },
  امبالا: { make: "Chevrolet", model: "Impala" },
  شارجر: { make: "Dodge", model: "Charger" },
  فوكس: { make: "Ford", model: "Focus" },
  فيوجن: { make: "Ford", model: "Fusion" },
  باسات: { make: "Volkswagen", model: "Passat" },
  "ميني كوبر": { make: "Mini", model: "Cooper" },
  كيان: { make: "Porsche", model: "Cayenne" },
  "بورش كيان": { make: "Porsche", model: "Cayenne" },
  كورفت: { make: "Chevrolet", model: "Corvette" },
  فيتارا: { make: "Suzuki", model: "Vitara" },
  داستر: { make: "Renault", model: "Duster" },
  توغيلا: { make: "Geely", model: "Tugella" },
  "جيلي توغيلا": { make: "Geely", model: "Tugella" },
  اريزو: { make: "Chery", model: "Arrizo" },
  "شيري اريزو": { make: "Chery", model: "Arrizo" },
  "تي 2": { make: "Jetour", model: "T2" },
  "جيتور تي 2": { make: "Jetour", model: "T2" },
  "حيتور تي 2": { make: "Jetour", model: "T2" },
  "570": { make: "Lexus", model: "LX" },
  "600": { make: "Lexus", model: "LX" },
  "لكزس 570": { make: "Lexus", model: "LX" },
  "ليكزس 570": { make: "Lexus", model: "LX" },
  "لكزس 600": { make: "Lexus", model: "LX" },
  "911": { make: "Porsche", model: "911" },
  "بورش 911": { make: "Porsche", model: "911" },
  fj: { make: "Toyota", model: "FJ Cruiser" },
  "تويوتا fj": { make: "Toyota", model: "FJ Cruiser" },
  "ار اكس": { make: "Lexus", model: "RX" },
  "لكزس ار اكس": { make: "Lexus", model: "RX" },
  "ن اكس": { make: "Lexus", model: "NX" },
  "لكزس ن اكس": { make: "Lexus", model: "NX" },
  e200: { make: "Mercedes", model: "E200" },
  "مرسيدس e200": { make: "Mercedes", model: "E200" },
  هياس: { make: "Toyota", model: "Hiace" },
  "تويوتا هياس": { make: "Toyota", model: "Hiace" },
  "تويوتا كروزر": { make: "Toyota", model: "Land Cruiser" },
  "تيوتا كروزر": { make: "Toyota", model: "Land Cruiser" },
  "تويوتا كامري": { make: "Toyota", model: "Camry" },
  "تويوتا كورولا": { make: "Toyota", model: "Corolla" },
  "تويوتا برادو": { make: "Toyota", model: "Prado" },
  "تويوتا افالون": { make: "Toyota", model: "Avalon" },
  "تويوتا ياريس": { make: "Toyota", model: "Yaris" },
  "تويوتا فورتشنر": { make: "Toyota", model: "Fortuner" },
  "تويوتا سكويا": { make: "Toyota", model: "Sequoia" },
  "نيسان باترول": { make: "Nissan", model: "Patrol" },
  "نيسان بترول": { make: "Nissan", model: "Patrol" },
  "نيسان التيما": { make: "Nissan", model: "Altima" },
  "نيسان تيدا": { make: "Nissan", model: "Tiida" },
  "نيسان جوك": { make: "Nissan", model: "Juke" },
  "نيسان مورانو": { make: "Nissan", model: "Murano" },
  "نيسان باثفندر": { make: "Nissan", model: "Pathfinder" },
  "نيسان باثفاندر": { make: "Nissan", model: "Pathfinder" },
  "نيسان ساني": { make: "Nissan", model: "Sunny" },
  "نيسان سني": { make: "Nissan", model: "Sunny" },
  "نيسان ارمادا": { make: "Nissan", model: "Armada" },
  "نيسان اكستيرا": { make: "Nissan", model: "Xterra" },
  "نيسان اكستريل": { make: "Nissan", model: "XTrail" },
  "نيسان كاشكاي": { make: "Nissan", model: "Qashqai" },
  "نيسان كيكس": { make: "Nissan", model: "Kicks" },
  "نيسان فتك": { make: "Nissan", model: "Patrol" },
  "نيسان اورفان": { make: "Nissan", model: "Urvan" },
  "نيسان بيك اب": { make: "Nissan", model: "Pick up" },
  "كيا سيراتو": { make: "Kia", model: "Cerato" },
  "كيا ريو": { make: "Kia", model: "Rio" },
  "كيا سبورتاج": { make: "Kia", model: "Sportage" },
  "كيا سورنتو": { make: "Kia", model: "Sorento" },
  "جمس سييرا": { make: "GMC", model: "Sierra" },
  "جمس سيرا": { make: "GMC", model: "Sierra" },
  "جمس يوكون": { make: "GMC", model: "Yukon" },
  "جمس يوكن": { make: "GMC", model: "Yukon" },
  "جمس اكاديا": { make: "GMC", model: "Acadia" },
  "جمس تيران": { make: "GMC", model: "Terrain" },
  "هوندا اكورد": { make: "Honda", model: "Accord" },
  "هوندا بايلوت": { make: "Honda", model: "Pilot" },
  "هوندا سيتي": { make: "Honda", model: "City" },
  "هوندا سيفيك": { make: "Honda", model: "Civic" },
  "هوندا سي ار في": { make: "Honda", model: "CR-V" },
  "هيونداي توسان": { make: "Hyundai", model: "Tucson" },
  "هيونداي اكسنت": { make: "Hyundai", model: "Accent" },
  "هيونداي النترا": { make: "Hyundai", model: "Elantra" },
  "شفروليه تاهو": { make: "Chevrolet", model: "Tahoe" },
  "شفر تاهو": { make: "Chevrolet", model: "Tahoe" },
  "شفروليه سلفرادو": { make: "Chevrolet", model: "Silverado" },
  "شفر سلفرادو": { make: "Chevrolet", model: "Silverado" },
  "شفروليه ماليبو": { make: "Chevrolet", model: "Malibu" },
  "شفروليه كروز": { make: "Chevrolet", model: "Cruze" },
  "شفروليه امبالا": { make: "Chevrolet", model: "Impala" },
  "دودج رام": { make: "Dodge", model: "Ram" },
  "دودج شارجر": { make: "Dodge", model: "Charger" },
  "فورد فيوجن": { make: "Ford", model: "Fusion" },
  "فورد فوكس": { make: "Ford", model: "Focus" },
  "فورد رابتور": { make: "Ford", model: "F-150" },
  "جيب شيروكي": { make: "Jeep", model: "Cherokee" },
  "جيب رانجلر": { make: "Jeep", model: "Wrangler" },
  "ميتسوبيشي باجيرو": { make: "Mitsubishi", model: "Pajero" },
  "ميتسوبيشي لانسر": { make: "Mitsubishi", model: "Lancer" },
  "سوزوكي فيتارا": { make: "Suzuki", model: "Vitara" },
  "رينو داستر": { make: "Renault", model: "Duster" },
  راف4: { make: "Toyota", model: "Rav 4" },
  "راف 4": { make: "Toyota", model: "Rav 4" },
  اوتلاندر: { make: "Mitsubishi", model: "Outlander" },
  كابتيفا: { make: "Chevrolet", model: "Captiva" },
  سانتافي: { make: "Hyundai", model: "Santa Fe" },
  كامارو: { make: "Chevrolet", model: "Camaro" },
  كمارو: { make: "Chevrolet", model: "Camaro" },
  سيلفرادو: { make: "Chevrolet", model: "Silverado" },
  ماكسوس: { make: "Maxus", model: "Other" },
  توارغ: { make: "Volkswagen", model: "Touareg" },
  تيغوان: { make: "Volkswagen", model: "Tiguan" },
  بيكانتو: { make: "Kia", model: "Picanto" },
  موستنغ: { make: "Ford", model: "Mustang" },
  كرفان: { make: "Dodge", model: "Caravan" },
  "ليكسز ال اكس": { make: "Lexus", model: "LX" },
  "ليكسس ال اكس": { make: "Lexus", model: "LX" },
  "انفينيتس كيو اكس 80": { make: "Infiniti", model: "QX80" },
  "gmc سيرا": { make: "GMC", model: "Sierra" },
  "gmcسييرا": { make: "GMC", model: "Sierra" },
  "gmc اكاديا": { make: "GMC", model: "Acadia" },
  "kia سيراتo": { make: "Kia", model: "Cerato" },
  "kiaسيراتo": { make: "Kia", model: "Cerato" },
  "متسوبيشي لانسر": { make: "Mitsubishi", model: "Lancer" },
  "متسوبيشي باجيرo": { make: "Mitsubishi", model: "Pajero" },
  "ميتسوبيشي لانسر": { make: "Mitsubishi", model: "Lancer" },
  "لانسر ميتسوبيشي": { make: "Mitsubishi", model: "Lancer" },
  "باجيرo ميتسوبيشi": { make: "Mitsubishi", model: "Pajero" },
  "باجيرo ميتسوبيشي": { make: "Mitsubishi", model: "Pajero" },
  "ساني نيسان": { make: "Nissan", model: "Sunny" },
  "نبسان تيدا": { make: "Nissan", model: "Tiida" },
  "سوناتا هيونداي": { make: "Hyundai", model: "Sonata" },
  "قولف باسات": { make: "Volkswagen", model: "Passat" },
  "bmw 740": { make: "BMW", model: "740" },
  "byd ت": { make: "BYD", model: "Other" },
  "جاك صيني": { make: "JAC", model: "Other" },
  "السياره لينكون موديل 1983": { make: "Lincoln", model: "Other" },
  اكسيد: { make: "MG", model: "MG5" },
  "1 صينيه": { make: "Other", model: "Other" },
  "اكس 5": { make: "BMW", model: "X5" },
  "اكس5": { make: "BMW", model: "X5" },
  "هندا crv": { make: "Honda", model: "CR-V" },
  "هوندا crv": { make: "Honda", model: "CR-V" },
  "تيجو برو": { make: "Chery", model: "Tiggo" },
  "كيتور ت 2": { make: "Jetour", model: "T2" },
  "جيتور ت 2": { make: "Jetour", model: "T2" },
  "ثندر بيرد": { make: "Ford", model: "Thunderbird" },
  "فان نيسان": { make: "Nissan", model: "Urvan" },
  "van نيسان": { make: "Nissan", model: "Urvan" },
  "تويوتا شاص": { make: "Toyota", model: "Land Cruiser" },
  "toyota شاص": { make: "Toyota", model: "Land Cruiser" },
  "لاند روفر فيلار": { make: "Land Rover", model: "Velar" },
  "land rover فيلار": { make: "Land Rover", model: "Velar" },
  فيلار: { make: "Land Rover", model: "Velar" },
  "jetour dashing": { make: "Jetour", model: "Dashing" },
  "جيتور dashing": { make: "Jetour", model: "Dashing" },
  "قولف باسات": { make: "Volkswagen", model: "Passat" },
  "فولكس باسات": { make: "Volkswagen", model: "Passat" },
  فوكس: { make: "Volkswagen", model: "Fox" },
  "جيتور t2": { make: "Jetour", model: "T2" },
  "فكس فاجن": { make: "Volkswagen", model: "Fox" },
  "قولف فاجن": { make: "Volkswagen", model: "Passat" },
  "مرسيدس e200": { make: "Mercedes", model: "E200" },
  "موديل مريسيدس": { make: "Mercedes", model: "Other" },
  رنج: { make: "Land Rover", model: "Range Rover" },
  "فان صيني": { make: "Other", model: "Other" },
  "سيارة صيني": { make: "Other", model: "Other" },
  "جاك صيني": { make: "JAC", model: "Other" },
  "1 جك": { make: "JAC", model: "Other" },
  "1 صينيه": { make: "Other", model: "Other" },
  "سزوكي سويفت": { make: "Suzuki", model: "Swift" },
  اسكالايد: { make: "Cadillac", model: "Escalade" },
  "سوبر سفاري": { make: "Nissan", model: "Patrol" },
  "سيارة جنيسيس g80": { make: "Genesis", model: "G80" },
  g80: { make: "Genesis", model: "G80" },
  "بم bmw": { make: "BMW", model: "Other" },
  "فلز فجن": { make: "Volkswagen", model: "Other" },
  "محمد تيوتا": { make: "Toyota", model: "Other" },
  "ام مشعل لكزس  ٢٠١٥": { make: "Lexus", model: "Other" },
  "موديل مريسيدس": { make: "Mercedes", model: "Other" },
  "كرنفال": { make: "Kia", model: "Carnival" },
};

const SORTED_ARABIC_MAKES = Object.entries(ARABIC_MAKES).sort(
  (a, b) => b[0].length - a[0].length
);
const SORTED_ARABIC_MODELS = Object.entries(ARABIC_MODELS).sort(
  (a, b) => b[0].length - a[0].length
);

function lookupArabicModelPhrase(phrase) {
  const canonical = canonicalizeArabicPhrase(phrase);
  const key = normalizeArabic(canonical);
  if (ARABIC_MODELS[key]) return ARABIC_MODELS[key];

  for (const [modelKey, hit] of SORTED_ARABIC_MODELS) {
    if (key === modelKey || key.includes(modelKey)) return hit;
  }

  let best = null;
  let bestScore = 0;
  for (const [modelKey, hit] of SORTED_ARABIC_MODELS) {
    if (modelKey.length < 4) continue;
    const score = similarity(key, modelKey);
    if (score > bestScore && score >= 0.82) {
      bestScore = score;
      best = hit;
    }
  }
  return best;
}

/**
 * @param {string} text - Arabic cmodel (year already stripped)
 * @returns {{ make: string, model: string } | null}
 */
function matchArabicVehicle(text) {
  const canonical = canonicalizeArabicPhrase(text);
  const ar = normalizeArabic(canonical);
  if (!ar) return null;

  const direct = lookupArabicModelPhrase(ar);
  if (direct) return direct;

  for (const [latinToken, enMake] of SORTED_LATIN_MAKES) {
    if (ar === latinToken || ar.startsWith(`${latinToken} `)) {
      const rest = ar.slice(latinToken.length).trim();
      const modelHit = lookupArabicModelPhrase(rest);
      if (modelHit) {
        return { make: modelHit.make || enMake, model: modelHit.model };
      }
      return { make: enMake, model: rest };
    }
    if (ar.startsWith(latinToken)) {
      const rest = ar.slice(latinToken.length).trim();
      const modelHit = lookupArabicModelPhrase(rest);
      if (modelHit) {
        return { make: modelHit.make || enMake, model: modelHit.model };
      }
      if (rest) return { make: enMake, model: rest };
    }
  }

  for (const [arMake, enMake] of SORTED_ARABIC_MAKES) {
    if (ar === arMake) {
      return { make: enMake, model: "" };
    }
    if (ar.startsWith(`${arMake} `)) {
      const rest = ar.slice(arMake.length).trim();
      const modelHit = lookupArabicModelPhrase(rest);
      if (modelHit) {
        return { make: modelHit.make || enMake, model: modelHit.model };
      }
      return { make: enMake, model: rest };
    }
  }

  let bestMake = null;
  let bestScore = 0;
  for (const [arMake, enMake] of SORTED_ARABIC_MAKES) {
    if (arMake.length < 3) continue;
    const score = similarity(ar, arMake);
    if (score > bestScore && score >= 0.85) {
      bestScore = score;
      bestMake = enMake;
    }
  }
  if (bestMake) return { make: bestMake, model: "" };

  return null;
}

module.exports = {
  normalizeArabic,
  matchArabicVehicle,
  ARABIC_MAKES,
  ARABIC_MODELS,
};
