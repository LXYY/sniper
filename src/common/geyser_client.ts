import config from "./config";
import { GeyserClient } from "../gen/geyser/geyser";
import { ChannelCredentials } from "@grpc/grpc-js";

const geyserClient = new GeyserClient(
  config.confidential.geyserGrpcUri,
  ChannelCredentials.createInsecure(),
);
export default geyserClient;
