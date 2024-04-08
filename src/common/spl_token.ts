import { PublicKey } from "@solana/web3.js";
import { MetadataAccountData } from "@metaplex-foundation/mpl-token-metadata";

export interface SplToken {
  mintAddress: PublicKey;
  mintDisabled: boolean;
  freezeDisabled: boolean;
  name?: string;
  symbol?: string;
  image?: string;
  hydrate(mintAddress: PublicKey): Promise<void>;
}
