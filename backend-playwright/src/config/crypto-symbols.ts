/**
 * 热门加密货币币种预设列表
 * 用于实时币价信息源
 */

export interface CryptoSymbol {
  symbol: string;      // 币种符号
  name: string;        // 中文名称
  binanceSymbol: string; // Binance交易对
  category: 'mainstream' | 'altcoin' | 'meme' | 'defi' | 'layer2';
}

/**
 * 30个热门币种
 */
export const POPULAR_CRYPTO_SYMBOLS: CryptoSymbol[] = [
  // 主流币 (Mainstream)
  { symbol: 'BTC', name: '比特币', binanceSymbol: 'BTCUSDT', category: 'mainstream' },
  { symbol: 'ETH', name: '以太坊', binanceSymbol: 'ETHUSDT', category: 'mainstream' },
  { symbol: 'BNB', name: '币安币', binanceSymbol: 'BNBUSDT', category: 'mainstream' },
  { symbol: 'SOL', name: 'Solana', binanceSymbol: 'SOLUSDT', category: 'mainstream' },
  { symbol: 'XRP', name: 'Ripple', binanceSymbol: 'XRPUSDT', category: 'mainstream' },
  { symbol: 'ADA', name: 'Cardano', binanceSymbol: 'ADAUSDT', category: 'mainstream' },
  { symbol: 'AVAX', name: 'Avalanche', binanceSymbol: 'AVAXUSDT', category: 'mainstream' },
  { symbol: 'DOT', name: 'Polkadot', binanceSymbol: 'DOTUSDT', category: 'mainstream' },
  
  // 热门山寨币 (Popular Altcoins)
  { symbol: 'DOGE', name: '狗狗币', binanceSymbol: 'DOGEUSDT', category: 'altcoin' },
  { symbol: 'SHIB', name: '柴犬币', binanceSymbol: 'SHIBUSDT', category: 'altcoin' },
  { symbol: 'MATIC', name: 'Polygon', binanceSymbol: 'MATICUSDT', category: 'altcoin' },
  { symbol: 'LINK', name: 'Chainlink', binanceSymbol: 'LINKUSDT', category: 'altcoin' },
  { symbol: 'UNI', name: 'Uniswap', binanceSymbol: 'UNIUSDT', category: 'altcoin' },
  { symbol: 'ATOM', name: 'Cosmos', binanceSymbol: 'ATOMUSDT', category: 'altcoin' },
  { symbol: 'LTC', name: '莱特币', binanceSymbol: 'LTCUSDT', category: 'altcoin' },
  { symbol: 'FTM', name: 'Fantom', binanceSymbol: 'FTMUSDT', category: 'altcoin' },
  
  // Layer 2
  { symbol: 'ARB', name: 'Arbitrum', binanceSymbol: 'ARBUSDT', category: 'layer2' },
  { symbol: 'OP', name: 'Optimism', binanceSymbol: 'OPUSDT', category: 'layer2' },
  
  // DeFi
  { symbol: 'AAVE', name: 'Aave', binanceSymbol: 'AAVEUSDT', category: 'defi' },
  { symbol: 'MKR', name: 'Maker', binanceSymbol: 'MKRUSDT', category: 'defi' },
  { symbol: 'CRV', name: 'Curve', binanceSymbol: 'CRVUSDT', category: 'defi' },
  { symbol: 'SUSHI', name: 'SushiSwap', binanceSymbol: 'SUSHIUSDT', category: 'defi' },
  
  // 热门新币和Meme币
  { symbol: 'PEPE', name: 'Pepe', binanceSymbol: 'PEPEUSDT', category: 'meme' },
  { symbol: 'BONK', name: 'Bonk', binanceSymbol: 'BONKUSDT', category: 'meme' },
  { symbol: 'WIF', name: 'dogwifhat', binanceSymbol: 'WIFUSDT', category: 'meme' },
  { symbol: 'FLOKI', name: 'Floki', binanceSymbol: 'FLOKIUSDT', category: 'meme' },
  
  // 其他热门
  { symbol: 'APT', name: 'Aptos', binanceSymbol: 'APTUSDT', category: 'altcoin' },
  { symbol: 'SUI', name: 'Sui', binanceSymbol: 'SUIUSDT', category: 'altcoin' },
  { symbol: 'TIA', name: 'Celestia', binanceSymbol: 'TIAUSDT', category: 'altcoin' },
  { symbol: 'INJ', name: 'Injective', binanceSymbol: 'INJUSDT', category: 'altcoin' },
];

/**
 * 根据分类获取币种
 */
export function getSymbolsByCategory(category: CryptoSymbol['category']): CryptoSymbol[] {
  return POPULAR_CRYPTO_SYMBOLS.filter(s => s.category === category);
}

/**
 * 获取所有币种符号
 */
export function getAllSymbols(): string[] {
  return POPULAR_CRYPTO_SYMBOLS.map(s => s.symbol);
}

/**
 * 获取币种的Binance交易对
 */
export function getBinanceSymbol(symbol: string): string | undefined {
  return POPULAR_CRYPTO_SYMBOLS.find(s => s.symbol === symbol)?.binanceSymbol;
}

