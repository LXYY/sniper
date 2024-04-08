import dotenv from "dotenv";

dotenv.config();

import config from "./common/config";
import solConnection from "./common/sol_connection";
import geyserClient from "./common/geyser_client";
import { PublicKey } from "@solana/web3.js";

async function main() {
  console.log(config);
  const recentBlockhash = await solConnection.getLatestBlockhash();
  console.log(recentBlockhash);
  const stream = geyserClient.subscribeProgramUpdates({
    programs: [
      new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8").toBytes(),
    ],
  });
  stream.on("readable", () => {
    const msg = stream.read(1);
    if (msg) {
      console.log(new PublicKey(msg.accountUpdate.pubkey).toBase58());
      console.log(msg);
    }
  });
  stream.on("error", (e) =>
    console.error("Error in program update subscription ", e),
  );
}

main();
