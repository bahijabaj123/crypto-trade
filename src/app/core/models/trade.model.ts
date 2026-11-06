// Structure d'une réponse Trade de Binance
export interface BinanceTrade {
  eventType: string;      // "trade"
  eventTime: number;
  symbol: string;
  tradeId: number;
  price: string;
  quantity: string;
  buyerOrderId: number;
  sellerOrderId: number;
  tradeTime: number;
  isBuyerMaker: boolean;
  ignore: string;
}

// Format simplifié pour l'affichage
export interface TradeData {
  id: number;
  price: number;
  quantity: number;
  time: number;
  isBuyer: boolean;
}