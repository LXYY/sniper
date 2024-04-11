import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import solConnection from "./sol_connection";
import { Keypair } from "@solana/web3.js";
import sniperConfig from "./config";
import bs58 from "bs58";
import { keypairIdentity } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";

function createDefaultUmi() {
  let umi = createUmi(solConnection);
  const payerSecretKey = bs58.decode(
    sniperConfig.confidential.walletPrivateKey,
  );
  const payer = Keypair.fromSecretKey(payerSecretKey);
  umi = umi.use(keypairIdentity(fromWeb3JsKeypair(payer)));
  return umi;
}

const defaultUmi = createDefaultUmi();
export default defaultUmi;
