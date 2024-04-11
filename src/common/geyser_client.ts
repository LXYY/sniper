import config from "./config";
import { GeyserClient } from "../gen/geyser/geyser";
import { ChannelCredentials } from "@grpc/grpc-js";

const geyserClient = new GeyserClient(
  config.confidential.geyserGrpcUri,
  ChannelCredentials.createInsecure(),
  {
    "grpc.max_receive_message_length": 1024 * 1024 * 10, // 10 MB
    "grpc.max_send_message_length": 1024 * 1024 * 10, // 10 MB
    "grpc.max_concurrent_streams": 10000,
    "grpc.keepalive_time_ms": 60000,
    "grpc.keepalive_timeout_ms": 20000,
    "grpc.http2.min_time_between_pings_ms": 10000,
    "grpc.http2.max_pings_without_data": 5,
    "grpc.keepalive_permit_without_calls": 1,
  },
);
export default geyserClient;
