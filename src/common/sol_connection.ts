import config from "./config";
import { Connection } from "@solana/web3.js";

const solConnection = new Connection(config.confidential.solanaRpcUri, {
  commitment: "processed",
  wsEndpoint: config.confidential.solanaWebsocketUri,
});
export default solConnection;
