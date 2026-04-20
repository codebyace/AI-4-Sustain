'use strict';
const axios = require('axios');

const THEME_KEYWORDS = {
  renewable:    'solar OR wind OR "renewable energy" OR geothermal OR hydrogen',
  emissions:    '"carbon emissions" OR methane OR "fossil fuel" OR "net zero"',
  biodiversity: 'biodiversity OR deforestation OR wildlife OR "species extinction"',
  water:        'flood OR drought OR groundwater OR glacier OR "sea level"',
  policy:       '"climate policy" OR COP OR "carbon tax" OR "Paris Agreement"',
};

const REGION_MAP = {
  global:   '',
  europe:   'Europe',
  asia:     'Asia',
  americas: 'Americas',
  africa:   'Africa',
};

const TIMESPAN_MAP = {
  '7d':  '7d',
  '30d': '30d',
  '90d': '90d',
  '1y':  '365d',
};

const NON_ENGLISH_DOMAINS = ['xinhua', 'chinadaily', 'tass', 'rt.com', 'sputnik', 'globaltimes'];
const NON_LATIN = /[^\u0000-\u024F]/;

const FALLBACK = {
  renewable:    [
    { title: 'Solar capacity breaks global records', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Solar installations reached a new milestone driven by falling costs.' },
    { title: 'Wind energy surpasses coal in Europe', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Offshore wind generation exceeded coal power for the first time.' },
    { title: 'Green hydrogen projects scale up', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Electrolysis-based hydrogen sees major investment commitments.' },
    { title: 'Battery storage transforms grid reliability', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Utility-scale batteries smooth out renewable intermittency issues.' },
    { title: 'EV adoption accelerates in emerging markets', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Electric vehicle sales surged in Asia and Latin America this quarter.' },
  ],
  emissions:    [
    { title: 'CO2 levels reach new atmospheric high', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'NOAA reports carbon dioxide concentrations exceeded 425 ppm.' },
    { title: 'Methane emissions underreported globally', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Satellite data shows oil and gas methane far above official estimates.' },
    { title: 'Aviation emissions pose long-term challenge', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Airlines face pressure to adopt sustainable fuels amid rising demand.' },
    { title: 'Industry faces steep decarbonisation hurdles', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Steel, cement, and chemicals account for a quarter of global emissions.' },
    { title: 'Net-zero pledges scrutinised for credibility', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Analysts warn many corporate net-zero plans lack robust interim steps.' },
  ],
  biodiversity: [
    { title: 'Amazon deforestation accelerates', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Satellite data records record forest loss across the Brazilian Amazon.' },
    { title: 'Coral reefs face mass bleaching', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Ocean heat pushes bleaching events to unprecedented frequency.' },
    { title: 'Insect decline threatens food systems', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Flying insect populations have fallen over 75 percent in three decades.' },
    { title: 'Global rewilding gains momentum', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Wolf and lynx reintroductions restore ecosystem function in Europe.' },
    { title: 'Mangrove loss endangers coastal communities', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Coastal development erases mangrove buffers that protect millions.' },
  ],
  water:        [
    { title: 'Himalayan glaciers retreating rapidly', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Ice loss threatens freshwater for nearly 2 billion people downstream.' },
    { title: 'Colorado River faces historic shortage', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Prolonged drought and overuse push reservoir levels to record lows.' },
    { title: 'Floods displace millions across South Asia', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Monsoon intensification causes catastrophic flooding and displacement.' },
    { title: 'Sea level rise accelerates along coastlines', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Satellite altimetry confirms faster-than-expected sea level increases.' },
    { title: 'Groundwater depletion worsens food security', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Aquifer over-extraction is unsustainable across major farming regions.' },
  ],
  policy:       [
    { title: 'COP summit delivers fossil fuel transition deal', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Nations agreed to transition away from fossil fuels for the first time.' },
    { title: 'EU carbon border tax enters transitional phase', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'The CBAM mechanism will require emissions reporting from importers.' },
    { title: 'US clean energy law drives record investment', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'The Inflation Reduction Act has mobilised hundreds of billions in capital.' },
    { title: 'Paris Agreement stocktake warns of shortfall', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Current NDCs are far below the trajectory needed to meet 1.5C targets.' },
    { title: 'Climate lawsuits proliferate worldwide', url: '#', source: 'FallbackNews', date: new Date().toISOString(), snippet: 'Courts in Europe and Australia rule against government climate inaction.' },
  ],
};

function isEnglish(article) {
  if (article.language && article.language !== 'English') return false;
  if (NON_LATIN.test(article.title || '')) return false;
  const url = (article.url || '').toLowerCase();
  if (NON_ENGLISH_DOMAINS.some(d => url.includes(d))) return false;
  return true;
}

function buildUrl(theme, region, timespan) {
  const kw = THEME_KEYWORDS[theme] || THEME_KEYWORDS.renewable;
  const ts = TIMESPAN_MAP[timespan] || '30d';
  const query = region && REGION_MAP[region]
    ? `(${kw}) AND "${REGION_MAP[region]}"`
    : `(${kw})`;

  const params = new URLSearchParams({
    query,
    mode:       'artlist',
    maxrecords: '25',
    format:     'json',
    sourcelang: 'english',
    sort:       'DateDesc',
    timespan:   ts,
  });
  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
}

function parseArticles(data) {
  const items = data.articles || [];
  return items
    .filter(isEnglish)
    .map(a => ({
      title:   a.title  || 'Untitled',
      url:     a.url    || '#',
      source:  a.domain || a.sourcecountry || 'Unknown',
      date:    a.seendate ? a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z') : new Date().toISOString(),
      snippet: a.socialimage ? '' : (a.title || ''),
    }));
}

async function fetchArticles(theme, region = 'global', timeWindow = '30d') {
  const url = buildUrl(theme, region, timeWindow);
  try {
    const res = await axios.get(url, { timeout: 15000 });
    let articles = parseArticles(res.data || {});

    if (articles.length === 0) {
      // Retry with simplified query and 90d
      const firstWord = (THEME_KEYWORDS[theme] || '').split(' ')[0].replace(/"/g, '');
      const retryUrl = `https://api.gdeltproject.org/api/v2/doc/doc?` +
        new URLSearchParams({ query: firstWord, mode: 'artlist', maxrecords: '25', format: 'json', sourcelang: 'english', sort: 'DateDesc', timespan: '90d' });
      const res2 = await axios.get(retryUrl, { timeout: 15000 });
      articles = parseArticles(res2.data || {});
    }

    if (articles.length === 0) {
      return FALLBACK[theme] || FALLBACK.renewable;
    }
    return articles;
  } catch (err) {
    console.error('[GDELT] fetch error:', err.message);
    return FALLBACK[theme] || FALLBACK.renewable;
  }
}

module.exports = { fetchArticles };
