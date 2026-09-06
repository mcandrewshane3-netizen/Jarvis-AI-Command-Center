const CURRENT_MARKET_LANGUAGE =
  /\b(right now|currently|today|current(?:\s+(?:price|volatility|regime|market data|market conditions?))?|strongest|weakest|market leaders?|leading|momentum|breakout|price action|paper trade|trade opportunity|trading at|trend)\b|\bbest\b.*\b(setup|trade|opportunity)\b/i;

const TRADABLE_MARKET_SUBJECT =
  /\b(crypto(?:currency)?|coins?|bitcoin|btc|ethereum|eth|solana|sol|stocks?|shares?|securit(?:y|ies)|tickers?|etfs?|options?|bonds?|portfolio|brokerage|trades?|trading|invest(?:ing|ment|or)|market (?:price|data)|price action)\b/i;

export function requiresCurrentMarketData(request: string): boolean {
  return CURRENT_MARKET_LANGUAGE.test(request);
}

export function isCurrentTradableMarketRequest(request: string): boolean {
  return TRADABLE_MARKET_SUBJECT.test(request) && requiresCurrentMarketData(request);
}