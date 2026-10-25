/**
 * Named Qatar areas for analytics. Bboxes are [minLat, minLng, maxLat, maxLng].
 * Smaller / more specific areas are listed first so Pearl wins over Doha.
 */

const QATAR_AREAS = [
  {
    id: "the_pearl",
    label: "The Pearl",
    bbox: [25.36, 51.53, 25.385, 51.565],
    aliases: ["pearl", "the pearl", "اللؤلؤة", "لؤلؤة"],
  },
  {
    id: "lusail",
    label: "Lusail",
    bbox: [25.39, 51.46, 25.50, 51.56],
    aliases: ["lusail", "لوسيل"],
  },
  {
    id: "west_bay",
    label: "West Bay",
    bbox: [25.32, 51.51, 25.355, 51.545],
    aliases: ["west bay", "westbay", "الخليج الغربي", "الغرافة"],
  },
  {
    id: "education_city",
    label: "Education City",
    bbox: [25.30, 51.41, 25.345, 51.46],
    aliases: ["education city", "المدينة التعليمية"],
  },
  {
    id: "hamad_airport",
    label: "Hamad Airport",
    bbox: [25.24, 51.59, 25.285, 51.64],
    aliases: ["airport", "hamad", "hia", "مطار", "مطار حمد"],
  },
  {
    id: "industrial_area",
    label: "Industrial Area",
    bbox: [25.10, 51.38, 25.20, 51.48],
    aliases: ["industrial", "industrial area", "المنطقة الصناعية"],
  },
  {
    id: "al_wakrah",
    label: "Al Wakrah",
    bbox: [25.10, 51.50, 25.22, 51.66],
    aliases: ["wakrah", "al wakrah", "الوكرة"],
  },
  {
    id: "al_khor",
    label: "Al Khor",
    bbox: [25.64, 51.46, 25.76, 51.58],
    aliases: ["khor", "al khor", "الخور"],
  },
  {
    id: "al_rayyan",
    label: "Al Rayyan",
    bbox: [25.24, 51.32, 25.38, 51.48],
    aliases: ["rayyan", "al rayyan", "الريان"],
  },
  {
    id: "doha",
    label: "Doha",
    bbox: [25.22, 51.48, 25.36, 51.60],
    aliases: ["doha", "الدوحة", "ad dawhah", "dawhah"],
  },
];

const UNMAPPED_AREA = { id: "unmapped", label: "Unmapped" };

function getAreaById(id) {
  return QATAR_AREAS.find((row) => row.id === id) || null;
}

module.exports = {
  QATAR_AREAS,
  UNMAPPED_AREA,
  getAreaById,
};
