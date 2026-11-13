export interface CountryOption {
  name: string;
  flag: string;
}

export interface ContinentGroup {
  continent: string;
  countries: CountryOption[];
}

export const CONTINENT_COUNTRIES: ContinentGroup[] = [
  {
    continent: "Eropa",
    countries: [
      { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
      { name: "France", flag: "🇫🇷" },
      { name: "Spain", flag: "🇪🇸" },
      { name: "Germany", flag: "🇩🇪" },
      { name: "Italy", flag: "🇮🇹" },
      { name: "Portugal", flag: "🇵🇹" },
      { name: "Netherlands", flag: "🇳🇱" },
      { name: "Belgium", flag: "🇧🇪" },
      { name: "Croatia", flag: "🇭🇷" },
      { name: "Denmark", flag: "🇩🇰" },
      { name: "Norway", flag: "🇳🇴" },
      { name: "Sweden", flag: "🇸🇪" },
      { name: "Switzerland", flag: "🇨🇭" },
      { name: "Austria", flag: "🇦🇹" },
      { name: "Poland", flag: "🇵🇱" },
      { name: "Serbia", flag: "🇷🇸" },
      { name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
      { name: "Ireland", flag: "🇮🇪" },
      { name: "Ukraine", flag: "🇺🇦" },
      { name: "Türkiye", flag: "🇹🇷" },
      { name: "Czech Republic", flag: "🇨🇿" },
      { name: "Hungary", flag: "🇭🇺" },
      { name: "Slovakia", flag: "🇸🇰" },
      { name: "Slovenia", flag: "🇸🇮" },
      { name: "Romania", flag: "🇷🇴" },
      { name: "Greece", flag: "🇬🇷" },
      { name: "Georgia", flag: "🇬🇪" },
      { name: "Iceland", flag: "🇮🇸" },
      { name: "Bosnia-Herzegovina", flag: "🇧🇦" },
      { name: "Montenegro", flag: "🇲🇪" },
      { name: "Kosovo", flag: "🇽🇰" },
      { name: "Russia", flag: "🇷🇺" },
    ],
  },
  {
    continent: "Amerika Selatan",
    countries: [
      { name: "Brazil", flag: "🇧🇷" },
      { name: "Argentina", flag: "🇦🇷" },
      { name: "Uruguay", flag: "🇺🇾" },
      { name: "Colombia", flag: "🇨🇴" },
      { name: "Ecuador", flag: "🇪🇨" },
      { name: "Paraguay", flag: "🇵🇾" },
      { name: "Venezuela", flag: "🇻🇪" },
    ],
  },
  {
    continent: "Amerika Utara",
    countries: [
      { name: "United States", flag: "🇺🇸" },
      { name: "Canada", flag: "🇨🇦" },
      { name: "Mexico", flag: "🇲🇽" },
    ],
  },
  {
    continent: "Afrika",
    countries: [
      { name: "Morocco", flag: "🇲🇦" },
      { name: "Senegal", flag: "🇸🇳" },
      { name: "Nigeria", flag: "🇳🇬" },
      { name: "Egypt", flag: "🇪🇬" },
      { name: "Algeria", flag: "🇩🇿" },
      { name: "Cote d'Ivoire", flag: "🇨🇮" },
      { name: "Cameroon", flag: "🇨🇲" },
      { name: "Ghana", flag: "🇬🇭" },
      { name: "Mali", flag: "🇲🇱" },
      { name: "Guinea", flag: "🇬🇳" },
      { name: "Burkina Faso", flag: "🇧🇫" },
      { name: "DR Congo", flag: "🇨🇩" },
      { name: "Cape Verde", flag: "🇨🇻" },
      { name: "The Gambia", flag: "🇬🇲" },
      { name: "Zimbabwe", flag: "🇿🇼" },
    ],
  },
  {
    continent: "Asia",
    countries: [
      { name: "Japan", flag: "🇯🇵" },
      { name: "Korea, South", flag: "🇰🇷" },
      { name: "Uzbekistan", flag: "🇺🇿" },
    ],
  },
];

export function findContinentForCountry(country: string): string {
  const found = CONTINENT_COUNTRIES.find((g) =>
    g.countries.some((c) => c.name.toLowerCase() === country.toLowerCase()),
  );
  return found?.continent ?? CONTINENT_COUNTRIES[0].continent;
}

export function getCountryFlag(country: string): string {
  for (const g of CONTINENT_COUNTRIES) {
    const match = g.countries.find((c) => c.name.toLowerCase() === country.toLowerCase());
    if (match) return match.flag;
  }
  return "🏳️";
}

export interface LeagueCategory {
  league: string;
  country: string;
  flag: string;
  clubs: string[];
}

export const LEAGUE_CATALOG: LeagueCategory[] = [
  {
    league: "Premier League",
    country: "Inggris",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    clubs: [
      "Arsenal FC",
      "Aston Villa",
      "AFC Bournemouth",
      "Brighton & Hove Albion",
      "Chelsea FC",
      "Crystal Palace",
      "Everton FC",
      "Liverpool FC",
      "Manchester City",
      "Manchester United",
      "Newcastle United",
      "Nottingham Forest",
      "Tottenham Hotspur",
      "Wolverhampton Wanderers",
    ],
  },
  {
    league: "La Liga",
    country: "Spanyol",
    flag: "🇪🇸",
    clubs: [
      "Real Madrid",
      "FC Barcelona",
      "Atlético de Madrid",
      "Athletic Bilbao",
      "Real Sociedad",
      "Real Betis Balompié",
      "Villarreal CF",
      "Sevilla FC",
      "Valencia CF",
      "Girona FC",
      "Celta de Vigo",
      "CA Osasuna",
      "Rayo Vallecano",
      "RCD Mallorca",
      "RCD Espanyol Barcelona",
      "Deportivo Alavés",
      "Elche CF",
      "Levante UD",
    ],
  },
  {
    league: "Serie A",
    country: "Italia",
    flag: "🇮🇹",
    clubs: [
      "Inter Milan",
      "AC Milan",
      "Juventus FC",
      "SSC Napoli",
      "AS Roma",
      "SS Lazio",
      "Atalanta BC",
      "ACF Fiorentina",
      "Bologna FC 1909",
      "Como 1907",
      "Cagliari Calcio",
      "Genoa CFC",
      "Parma Calcio 1913",
      "Udinese Calcio",
    ],
  },
  {
    league: "Bundesliga",
    country: "Jerman",
    flag: "🇩🇪",
    clubs: [
      "Bayern Munich",
      "Bayer 04 Leverkusen",
      "Borussia Dortmund",
      "RB Leipzig",
      "Eintracht Frankfurt",
      "VfB Stuttgart",
      "SC Freiburg",
      "TSG 1899 Hoffenheim",
      "VfL Wolfsburg",
      "Borussia Mönchengladbach",
      "1.FSV Mainz 05",
      "1.FC Union Berlin",
      "1.FC Köln",
      "FC Augsburg",
      "SV Werder Bremen",
      "Hamburger SV",
    ],
  },
  {
    league: "Ligue 1",
    country: "Prancis",
    flag: "🇫🇷",
    clubs: [
      "Paris Saint-Germain",
      "AS Monaco",
      "Olympique Marseille",
      "Olympique Lyon",
      "LOSC Lille",
      "OGC Nice",
      "RC Lens",
      "Stade Rennais FC",
      "RC Strasbourg Alsace",
      "FC Toulouse",
      "FC Nantes",
      "Paris FC",
    ],
  },
];
