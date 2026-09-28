// Demo profile details for the seed's people (features/demo/seed.ts PEOPLE): where they sit, and a
// work address. The seed names Ulm and "the second site"; the demo calls that one Ravensburg.
// Addresses use example.com (reserved, RFC 2606), so a click on one can never reach a real inbox.
// Stand-in until profiles come from the company directory.
export type Profile = { location: string; email: string };

const LOCATION: Record<string, string> = {
  "E. Lindqvist": "Ulm HQ", "K. Adler": "Ulm HQ", "R. Nowak": "Ulm HQ", "C. Ilg": "Ulm HQ",
  "L. Brandt": "Ulm HQ", "B. Ehlers": "Ulm HQ", "N. Kaya": "Ulm HQ", "A. Weber": "Ulm HQ", "P. Mayer": "Ulm HQ",
  "B. Hartmann": "Ulm plant", "T. Vogel": "Ulm plant", "J. Klein": "Ulm plant", "S. Dahl": "Ulm plant", "J. Schmidt": "Ulm plant",
  "M. Roth": "Ravensburg plant", "H. Sander": "Ravensburg plant", "D. Ferraro": "Ravensburg plant",
};

// "H. Sander" -> "h.sander@example.com"
export const emailOf = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z. ]/g, "").replace(/\.?\s+/g, ".") + "@example.com";

export const profileOf = (name: string): Profile => ({ location: LOCATION[name] ?? "Ulm HQ", email: emailOf(name) });
