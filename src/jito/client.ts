import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import sniperConfig from "../common/config";

const jitoClient = searcherClient(
  sniperConfig.confidential.jitoApiUri,
  Keypair.fromSecretKey(bs58.decode(sniperConfig.confidential.jitoPrivateKey)),
);

export default jitoClient;
