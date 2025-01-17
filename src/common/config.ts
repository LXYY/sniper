import { QuoteToken } from "./types";
import TOML from "@iarna/toml";
import * as fs from "fs";
import { Keypair, Connection } from "@solana/web3.js";
import * as bs58 from "bs58";

export interface SniperConfig {
  confidential?: ConfidentialConfig;
  general: GeneralConfig;
  txn: TxnConfig;
  pool: PoolConfig;
  monitor: MonitorConfig;
  strategy: StrategyConfig;
  spam: SpamConfig;
}

/**
 * Confidential configuration initialized via environment variables.
 */
export interface ConfidentialConfig {
  walletPrivateKey: string;
  solanaRpcUri: string;
  solanaWebsocketUri: string;
  geyserGrpcUri: string;
  jitoPrivateKey: string;
  jitoApiUri: string;
}

export interface GeneralConfig {
  quoteToken: QuoteToken;
  dbConnectionStr: string;
  summaryLoggingInterval: number;
  dryRun: boolean;
  oneShotMode: boolean;
  priceSampleInterval: number;
  activeTasksPollingInterval: number;
  sendTxnRetries: number;
  defaultPriorityFeeLamports: number;
}

export interface TxnConfig {
  skipPreflight: boolean;
  txnSubmittingRetries: number;
}

export interface PoolConfig {
  requireMintDisabled: boolean;
  requireFreezeDisabled: boolean;
  requireMetadata: boolean;
  requireImage: boolean;
  requireSymbol: boolean;
  requireSocialMedia: boolean;
  minBaseTokenInPool: number;
  minQuoteTokenInPool: number;
  maxQuoteTokenInPool: number;
}

export interface MonitorConfig {
  poolCreationMonitorTimeout: number;
  poolCreationMonitorPollIntervalMs: number;
  minLpBurnPercentage: number;
  minPooledTokenPercentage: number;
  detectRugPuller: boolean;
  lpTokenPollIntervalMs: number;
  lpTokenMonitorTimeout: number;
}

export interface StrategyConfig {
  takeProfitPercentage: number;
  takeProfitSellPercentage: number;
  stopLossPercentage: number;
  stopLossSellPercentage: number;
  hardCashOutTimeSec: number;
  buySlippage: number;
  buyFeeMicroLamports: number;
  sellSlippage: number;
  sellFeeMicroLamports: number;
  quoteTokenBuyInPercentage: number;
  minQuoteTokenIn: number;
  maxQuoteTokenIn: number;
  quoteTickIntervalMs: number;
  jitoOnly: boolean;
  maxSlotsUntilNextJitoLeader: number;
  jitoTip: number;
}

export interface SpamConfig {
  enabled: boolean;
  initialDelaySec: number;
  intervalMs: number;
  timeoutSec: number;
  buyInAmount: number;
  numCashOutTxns: number;
}

function parseConfig(configFile: string): SniperConfig {
  const tomlData = fs.readFileSync(configFile, "utf-8");
  const config = TOML.parse(tomlData) as unknown as SniperConfig;
  config.confidential = initConfidentialConfig();
  return config;
}

function initConfidentialConfig(): ConfidentialConfig {
  return {
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
    solanaRpcUri: process.env.SOLANA_RPC_URI,
    solanaWebsocketUri: process.env.SOLANA_WEBSOCKET_URI,
    geyserGrpcUri: process.env.GEYSER_GRPC_URI,
    jitoPrivateKey: process.env.JITO_PRIVATE_KEY,
    jitoApiUri: process.env.JITO_API,
  };
}

const sniperConfig = parseConfig(process.argv[2]);
export default sniperConfig;
