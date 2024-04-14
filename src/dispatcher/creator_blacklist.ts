import { PublicKey } from "@solana/web3.js";

export interface CreatorBlacklist {
  init(): Promise<void>;
  add(creator: PublicKey): Promise<void>;
  has(creator: PublicKey): Promise<boolean>;
  remove(creator: PublicKey): Promise<void>;
}

export class InMemoryCreatorBlacklist implements CreatorBlacklist {
  private readonly creators: Set<string>;

  constructor() {
    this.creators = new Set<string>();
  }

  async init() {}

  async add(creator: PublicKey) {
    this.creators.add(creator.toString());
  }

  async has(creator: PublicKey) {
    return this.creators.has(creator.toString());
  }

  async remove(creator: PublicKey) {
    this.creators.delete(creator.toString());
  }
}
