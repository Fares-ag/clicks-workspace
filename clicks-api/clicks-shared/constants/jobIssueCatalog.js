/**
 * Canonical roadside issues for analytics and data cleaning.
 * Each issue belongs to a JOB_TYPES parent. Aliases cover EN typos,
 * historical Excel phrases, and common Gulf Arabic spellings.
 */

const JOB_ISSUE_CATALOG = [
  {
    id: "puncture_repair",
    label: "Puncture repair",
    jobType: "Flat Tire",
    aliasesEn: [
      "tire repair",
      "tyre repair",
      "flat tire",
      "flat tyre",
      "puncture",
      "puncure",
      "tyre puncure",
      "tire puncture",
      "puncture repair",
      "fix tire",
      "fix tyre",
      "burst tire",
      "burst tyre",
    ],
    aliasesAr: ["بنشر", "بنشر كفر", "كفر بنشر", "إصلاح إطار", "اصلاح اطار", "إطار بنشر"],
  },
  {
    id: "tire_change",
    label: "Tire change",
    jobType: "Tire Change",
    aliasesEn: [
      "change tire",
      "change tyre",
      "tire change",
      "tyre change",
      "replace tire",
      "replace tyre",
      "spare tire",
      "spare tyre",
      "swap tire",
    ],
    aliasesAr: ["تغيير كفر", "بدل كفر", "تبديل كفر", "تغيير إطار", "تغيير اطار"],
  },
  {
    id: "lock_out",
    label: "Lock out",
    jobType: "Lock Out",
    aliasesEn: [
      "lock door",
      "lockout",
      "lock out",
      "locked out",
      "key",
      "keys locked",
      "car locked",
      "keyless",
      "keyless car opening",
    ],
    aliasesAr: ["فتح سيارة", "مفتاح", "مقفلة", "مقفول", "فتح باب"],
  },
  {
    id: "jump_start",
    label: "Jump start",
    jobType: "Jump Start",
    aliasesEn: [
      "jump start",
      "jumpstart",
      "boost",
      "battery jump",
      "boost battery",
      "dead battery",
      "battery boost",
    ],
    aliasesAr: ["اشتراك", "إشتراك", "بطارية", "شحن بطارية", "تشغيل بطارية"],
  },
  {
    id: "battery_replacement",
    label: "Battery replacement",
    jobType: "Battery Replacement",
    aliasesEn: [
      "battery replacement",
      "replace battery",
      "new battery",
      "battery change",
      "change battery",
    ],
    aliasesAr: ["تغيير بطارية", "بدل بطارية", "بطارية جديدة"],
  },
  {
    id: "towing",
    label: "Towing",
    jobType: "Towing",
    aliasesEn: ["towing", "tow", "winch", "recovery", "tow truck"],
    aliasesAr: ["سطحة", "ونش", "سحب", "سحب سيارة"],
  },
  {
    id: "fuel_delivery",
    label: "Fuel delivery",
    jobType: "Fuel Delivery",
    aliasesEn: ["fuel delivery", "fuel", "petrol", "gasoline", "out of fuel", "no fuel"],
    aliasesAr: ["بنزين", "وقود", "نفذ البنزين", "توصيل بنزين"],
  },
  {
    id: "fuel_bump",
    label: "Fuel bump",
    jobType: "Fuel Bump",
    aliasesEn: ["fuel bump", "wrong fuel", "diesel in petrol", "petrol in diesel"],
    aliasesAr: ["بنزين خطأ", "وقود خطأ", "تعبئة غلط"],
  },
  {
    id: "no_start",
    label: "No start",
    jobType: "No Start",
    aliasesEn: [
      "no start",
      "wont start",
      "won't start",
      "will not start",
      "engine wont start",
      "car wont start",
      "doesn't start",
    ],
    aliasesAr: ["ما تشتغل", "لا تعمل", "ما تدور", "ما يشتغل"],
  },
  {
    id: "overheating",
    label: "Overheating",
    jobType: "Overheating",
    aliasesEn: ["overheating", "overheat", "over heating", "coolant", "temperature"],
    aliasesAr: ["حرارة", "سخونة", "محرك سخن", "زيادة حرارة"],
  },
  {
    id: "accident",
    label: "Accident",
    jobType: "Accident",
    aliasesEn: ["accident", "accident assistance", "crash", "collision"],
    aliasesAr: ["حادث", "حادثة", "تصادم"],
  },
  {
    id: "gear_box",
    label: "Gear box",
    jobType: "Gear Box",
    aliasesEn: ["gear", "gearbox", "gear box", "transmission"],
    aliasesAr: ["قير", "قير بوكس", "ناقل حركة"],
  },
  {
    id: "electrical",
    label: "Electrical",
    jobType: "Electrical",
    aliasesEn: ["electrical", "electric", "wiring", "lights", "alternator"],
    aliasesAr: ["كهرباء", "كهربائي", "دينمو"],
  },
  {
    id: "mechanical",
    label: "Mechanical",
    jobType: "Mechanical",
    aliasesEn: ["mechanical", "engine", "engines", "mechanic"],
    aliasesAr: ["ميكانيك", "ميكانيكي", "محرك"],
  },
  {
    id: "body_work",
    label: "Body work",
    jobType: "Body Work",
    aliasesEn: ["body work", "bodywork", "dent", "panel"],
    aliasesAr: ["سمكرة", "هيكل", "صدم"],
  },
  {
    id: "car_wash",
    label: "Car wash",
    jobType: "Car Wash",
    aliasesEn: ["car wash", "wash", "cleaning"],
    aliasesAr: ["غسيل", "غسيل سيارة"],
  },
];

const UNMAPPED_ISSUE = {
  id: "unmapped",
  label: "Unmapped",
  jobType: "",
};

function getIssueById(id) {
  return JOB_ISSUE_CATALOG.find((row) => row.id === id) || null;
}

function listJobIssues() {
  return JOB_ISSUE_CATALOG.map((row) => ({
    id: row.id,
    label: row.label,
    jobType: row.jobType,
  }));
}

module.exports = {
  JOB_ISSUE_CATALOG,
  UNMAPPED_ISSUE,
  getIssueById,
  listJobIssues,
};
