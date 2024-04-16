import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import sniperConfig from "./config";

export const sniperPayer = Keypair.fromSecretKey(
  bs58.decode(sniperConfig.confidential.walletPrivateKey),
);
