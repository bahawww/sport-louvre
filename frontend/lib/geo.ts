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
      { name: "England", flag: "ENG" },
      { name: "France", flag: "FRA" },
      { name: "Spain", flag: "ESP" },
      { name: "Germany", flag: "GER" },
      { name: "Italy", flag: "ITA" },
      { name: "Portugal", flag: "POR" },
      { name: "Netherlands", flag: "NED" },
      { name: "Belgium", flag: "BEL" },
      { name: "Croatia", flag: "CRO" },
      { name: "Denmark", flag: "DEN" },
      { name: "Norway", flag: "NOR" },
      { name: "Sweden", flag: "SWE" },
      { name: "Switzerland", flag: "SUI" },
      { name: "Austria", flag: "AUT" },
      { name: "Poland", flag: "POL" },
      { name: "Serbia", flag: "SRB" },
      { name: "Scotland", flag: "SCO" },
      { name: "Ireland", flag: "IRL" },
      { name: "Ukraine", flag: "UKR" },
      { name: "Türkiye", flag: "TUR" },
      { name: "Czech Republic", flag: "CZE" },
      { name: "Hungary", flag: "HUN" },
      { name: "Slovakia", flag: "SVK" },
      { name: "Slovenia", flag: "SLO" },
      { name: "Romania", flag: "ROU" },
      { name: "Greece", flag: "GRE" },
      { name: "Georgia", flag: "GEO" },
      { name: "Iceland", flag: "ISL" },
      { name: "Bosnia-Herzegovina", flag: "BIH" },
      { name: "Montenegro", flag: "MNE" },
      { name: "Kosovo", flag: "KOS" },
      { name: "Russia", flag: "RUS" },
    ],
  },
  {
    continent: "Amerika Selatan",
    countries: [
      { name: "Brazil", flag: "BRA" },
      { name: "Argentina", flag: "ARG" },
      { name: "Uruguay", flag: "URU" },
      { name: "Colombia", flag: "COL" },
      { name: "Ecuador", flag: "ECU" },
      { name: "Paraguay", flag: "PAR" },
      { name: "Venezuela", flag: "VEN" },
    ],
  },
  {
    continent: "Amerika Utara",
    countries: [
      { name: "United States", flag: "USA" },
      { name: "Canada", flag: "CAN" },
      { name: "Mexico", flag: "MEX" },
    ],
  },
  {
    continent: "Afrika",
    countries: [
      { name: "Morocco", flag: "MAR" },
      { name: "Senegal", flag: "SEN" },
      { name: "Nigeria", flag: "NGA" },
      { name: "Egypt", flag: "EGY" },
      { name: "Algeria", flag: "ALG" },
      { name: "Cote d'Ivoire", flag: "CIV" },
      { name: "Cameroon", flag: "CMR" },
      { name: "Ghana", flag: "GHA" },
      { name: "Mali", flag: "MLI" },
      { name: "Guinea", flag: "GUI" },
      { name: "Burkina Faso", flag: "BFA" },
      { name: "DR Congo", flag: "COD" },
      { name: "Cape Verde", flag: "CPV" },
      { name: "The Gambia", flag: "GAM" },
      { name: "Zimbabwe", flag: "ZIM" },
    ],
  },
  {
    continent: "Asia",
    countries: [
      { name: "Japan", flag: "JPN" },
      { name: "Korea, South", flag: "KOR" },
      { name: "Uzbekistan", flag: "UZB" },
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
  return "INT";
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
    flag: "ENG",
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
    flag: "ESP",
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
    flag: "ITA",
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
    flag: "GER",
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
    flag: "FRA",
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
