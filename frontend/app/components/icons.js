const paths = {
  "student-status":
    '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M9 3h6v4H9zM8 12h7M8 16h4M17 8l3 3 3-3M20 4v7"/>',
  notifications:
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  "profile-requests":
    '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="10" cy="9" r="2"/><path d="M7 15a3 3 0 0 1 6 0m2-6h2m-2 4h2M7 18h10"/>',
  curriculum:
    '<path d="M3 5h7a3 3 0 0 1 2 1 3 3 0 0 1 2-1h7v15h-7a3 3 0 0 0-2 1 3 3 0 0 0-2-1H3ZM12 6v15M6 9h3m-3 4h3m6-4h3m-3 4h3"/>',
  previous: '<path d="m14 6-6 6 6 6"/>',
  next: '<path d="m10 6 6 6-6 6"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18M15 3v18M3 15h18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1"/>',
  location:
    '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6"/>',
  attendance:
    '<path d="M9 4h12v18H3V4h3m0-2h9v5H6Zm1 11 2 2 4-5m3 3h2m-11 6h11"/>',
  finance:
    '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18m-5 5h2M7 3v4"/>',
  exams:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-6"/>',
  policies: '<path d="M5 4h14v18H5ZM9 2h6v4H9Zm-1 8h8m-8 4h8m-8 4h5"/>',
  grades: '<path d="M4 3h16v18H4Zm4 5h8m-8 5h3m-3 4h8m-2-5 2 2 3-4"/>',
  tasks: '<path d="M8 6V3h8v3M3 7h18v14H3ZM3 12c5 3 13 3 18 0"/>',
  approvals: '<path d="m12 3-9 4v6c0 5 9 9 9 9s9-4 9-9V7ZM8 12l3 3 5-6"/>',
  profile:
    '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
  schedule:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h3"/>',
  academics:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h3m3 0h2m-8 3h3"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  catalog:
    '<path d="M3 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3Zm18 0h-6a3 3 0 0 0-2 1v16a4 4 0 0 1 4-2h4Z"/>',
  students: '<path d="m2 8 10-5 10 5-10 5Zm4 3v6c4 3 8 3 12 0v-6M22 8v8"/>',
  accounts:
    '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m1-17a4 4 0 0 1 0 8m2 3a6 6 0 0 1 3 6"/>',
  audit: '<path d="M8 3H5v18h14V3h-3M8 2h8v4H8Zm0 9h8m-8 5h5"/>',
  menu: '<path d="M5 8h14M5 16h14"/>',
};

export function icon(name) {
  if (name === "grade-reviews") name = "grades";
  return /* HTML */ `<svg
    viewBox="0 0 24 24"
    width="19"
    height="19"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${paths[name] || paths.home}
  </svg>`;
}
