import config from "./config";
import { Connection } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi";

const solConnection = new Connection(config.confidential.solanaRpcUri, {
  commitment: "processed",
  wsEndpoint: config.confidential.solanaWebsocketUri,
});
export default solConnection;
