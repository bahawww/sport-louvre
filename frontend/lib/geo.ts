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
      "AFC Bournemouth",
      "Arsenal FC",
      "Aston Villa",
      "Brentford FC",
      "Brighton & Hove Albion",
      "Burnley FC",
      "Chelsea FC",
      "Crystal Palace",
      "Everton FC",
      "Fulham FC",
      "Leeds United",
      "Liverpool FC",
      "Manchester City",
      "Manchester United",
      "Newcastle United",
      "Nottingham Forest",
      "Sunderland AFC",
      "Tottenham Hotspur",
      "West Ham United",
      "Wolverhampton Wanderers",
    ],
  },
  {
    league: "La Liga",
    country: "Spanyol",
    flag: "🇪🇸",
    clubs: [
      "Athletic Bilbao",
      "Atlético de Madrid",
      "CA Osasuna",
      "Celta de Vigo",
      "Deportivo Alavés",
      "Elche CF",
      "FC Barcelona",
      "Getafe CF",
      "Girona FC",
      "Levante UD",
      "RCD Espanyol Barcelona",
      "RCD Mallorca",
      "Rayo Vallecano",
      "Real Betis Balompié",
      "Real Madrid",
      "Real Oviedo",
      "Real Sociedad",
      "Sevilla FC",
      "Valencia CF",
      "Villarreal CF",
    ],
  },
  {
    league: "Serie A",
    country: "Italia",
    flag: "🇮🇹",
    clubs: [
      "AC Milan",
      "ACF Fiorentina",
      "AS Roma",
      "Atalanta BC",
      "Bologna FC 1909",
      "Cagliari Calcio",
      "Como 1907",
      "Genoa CFC",
      "Hellas Verona",
      "Inter Milan",
      "Juventus FC",
      "Parma Calcio 1913",
      "Pisa Sporting Club",
      "SS Lazio",
      "SSC Napoli",
      "Torino FC",
      "US Cremonese",
      "US Lecce",
      "US Sassuolo",
      "Udinese Calcio",
    ],
  },
  {
    league: "Bundesliga",
    country: "Jerman",
    flag: "🇩🇪",
    clubs: [
      "1.FC Heidenheim 1846",
      "1.FC Köln",
      "1.FC Union Berlin",
      "1.FSV Mainz 05",
      "Bayer 04 Leverkusen",
      "Bayern Munich",
      "Borussia Dortmund",
      "Borussia Mönchengladbach",
      "Eintracht Frankfurt",
      "FC Augsburg",
      "FC St. Pauli",
      "Hamburger SV",
      "RB Leipzig",
      "SC Freiburg",
      "SV Werder Bremen",
      "TSG 1899 Hoffenheim",
      "VfB Stuttgart",
      "VfL Wolfsburg",
    ],
  },
  {
    league: "Ligue 1",
    country: "Prancis",
    flag: "🇫🇷",
    clubs: [
      "AJ Auxerre",
      "AS Monaco",
      "Angers SCO",
      "FC Lorient",
      "FC Metz",
      "FC Nantes",
      "FC Toulouse",
      "LOSC Lille",
      "Le Havre AC",
      "OGC Nice",
      "Olympique Lyon",
      "Olympique Marseille",
      "Paris FC",
      "Paris Saint-Germain",
      "RC Lens",
      "RC Strasbourg Alsace",
      "Stade Brestois 29",
      "Stade Rennais FC",
    ],
  },
];
