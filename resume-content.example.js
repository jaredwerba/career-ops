// Example resume content. Copy to resume-content.local.js (gitignored) and edit.
module.exports = {
  file: "output/Lastname_Firstname_Resume_Company_Role.docx",
  docTitle: "Firstname Lastname — Resume — Role (Company)",

  name: "Firstname Lastname",
  headline: "Target Role — Domain Focus",
  contact: "City, ST  ·  (555) 555-5555  ·  you@example.com  ·  linkedin.com/in/you",

  summary: "Two-to-three line positioning summary, tuned to the target req.",
  stats: "150%+ quota · $X largest deal · N net-new logos · N years in market",

  competencies: ["Enterprise Sales", "Cloud Infrastructure", "Solution Engineering"],

  roles: [
    {
      company: "Employer",
      title: "Account Executive",
      descriptor: "territory / segment",
      dates: "2018 – 2024",
      bullets: ["Metric-first achievement bullet.", "Second achievement bullet."],
    },
  ],

  education: [{ line: "B.S. Field — Institution" }],
};
