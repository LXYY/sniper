import { PublicKey } from "@solana/web3.js";
import {
  fetchJsonMetadata,
  MetadataAccountData,
} from "@metaplex-foundation/mpl-token-metadata";
import { QuoteToken } from "./types";
import solConnection from "./sol_connection";
import { backOff } from "exponential-backoff";
import { fetchMetadataFromSeeds } from "@metaplex-foundation/mpl-token-metadata";
import defaultUmi from "./umi";
import { fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { getMint } from "@solana/spl-token";

export interface SplToken {
  mintAddress: PublicKey;
  decimals: number;
  mintDisabled: boolean;
  freezeDisabled: boolean;
  name?: string;
  symbol?: string;
  image?: string;
}

export function fromQuoteToken(quoteToken: QuoteToken): SplToken {
  switch (quoteToken) {
    case QuoteToken.SOL:
      return {
        mintAddress: new PublicKey(
          new PublicKey("So11111111111111111111111111111111111111112"),
        ),
        mintDisabled: true,
        freezeDisabled: true,
        decimals: 9,
        name: "WSOL",
        symbol: "WSOL",
      };
    default:
      throw new Error(`Unsupported quote token: ${quoteToken}`);
  }
}

export function toQuoteToken(token: SplToken): QuoteToken {
  if (
    token.mintAddress.equals(
      new PublicKey("So11111111111111111111111111111111111111112"),
    )
  ) {
    return QuoteToken.SOL;
  }
  throw new Error(`Unsupported quote token mint address: ${token.mintAddress}`);
}

export async function getSplTokenFromMintAddress(
  mintAddress: PublicKey,
): Promise<SplToken> {
  // Fetch mint account
  const mintAccount = await backOff(() => {
    return getMint(solConnection, mintAddress, "confirmed");
  });

  // Fetch metadata account
  const metadata = await backOff(() =>
    fetchMetadataFromSeeds(defaultUmi, {
      mint: fromWeb3JsPublicKey(mintAddress),
    }),
  );

  // Fetch the metadata from the uri
  // const jsonMetadata = await backOff(() => {
  //   return fetchJsonMetadata(defaultUmi, metadata.uri);
  // });

  return {
    mintAddress,
    decimals: mintAccount.decimals,
    mintDisabled: !mintAccount.mintAuthority,
    freezeDisabled: !mintAccount.freezeAuthority,
    name: metadata.name,
    symbol: metadata.symbol,
  };
}
