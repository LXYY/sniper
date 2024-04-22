import { binarySearch, sleep } from "../common/utils";
import jitoClient from "./client";
import { SlotList } from "jito-ts/dist/gen/searcher";
import { backOff } from "exponential-backoff";
import { PublicKey } from "@solana/web3.js";

export interface LeaderPeriod {
  startSlot: number;
  endSlot: number;
}

export interface JitoLeaderSchedule {
  start(): Promise<void>;

  stop(): void;

  getNextLeaderPeriod(currentSlot: number): LeaderPeriod;

  getTipAccounts(): PublicKey[];
}

export class BatchJitoLeaderSchedule implements JitoLeaderSchedule {
  private stopped: boolean;
  private snapshotUpdateIntervalSec: number;
  private leaderSlotsSnapshot: number[];
  private tipAccounts: PublicKey[];

  constructor(snapshotUpdateIntervalSec: number) {
    this.snapshotUpdateIntervalSec = snapshotUpdateIntervalSec;
    this.leaderSlotsSnapshot = [];
    this.tipAccounts = [];
    this.stopped = false;
  }

  async start() {
    await this.updateLeaderSlotsSnapshot();
    setImmediate(() => this.startUpdatingLeaderSlots());
  }

  stop() {
    this.stopped = true;
  }

  private async startUpdatingLeaderSlots() {
    while (!this.stopped) {
      await sleep(this.snapshotUpdateIntervalSec * 1000);
      await this.updateLeaderSlotsSnapshot();
    }
  }

  private async updateLeaderSlotsSnapshot() {
    const leaders = await backOff(() => jitoClient.getConnectedLeaders());
    const slots = Object.values(leaders).flatMap((slotList) => slotList.slots);
    slots.sort((a, b) => a - b);
    this.leaderSlotsSnapshot = slots;

    const tipAccounts = await jitoClient.getTipAccounts();
    this.tipAccounts = tipAccounts.map((account) => new PublicKey(account));

    console.log(
      `Jito leader slots snapshot updated at: ${new Date().toUTCString()}`,
    );
  }

  getTipAccounts(): PublicKey[] {
    return this.tipAccounts;
  }

  getNextLeaderPeriod(currentSlot: number): LeaderPeriod {
    // Find the first slot in the snapshot that is greater or equal to the current slot with binary search.
    let startSlotIndex = binarySearch(
      this.leaderSlotsSnapshot,
      (i) => this.leaderSlotsSnapshot[i] < currentSlot,
    );

    if (startSlotIndex >= this.leaderSlotsSnapshot.length) {
      throw new Error("No leader slot found. Something went wrong.");
    }

    let endSlotIndex = startSlotIndex + 1;
    while (
      endSlotIndex < this.leaderSlotsSnapshot.length &&
      this.leaderSlotsSnapshot[endSlotIndex] <=
        this.leaderSlotsSnapshot[endSlotIndex - 1] + 1
    ) {
      endSlotIndex++;
    }

    return {
      startSlot: this.leaderSlotsSnapshot[startSlotIndex],
      endSlot: this.leaderSlotsSnapshot[endSlotIndex - 1],
    };
  }
}

const jitoLeaderSchedule = new BatchJitoLeaderSchedule(60);
export default jitoLeaderSchedule;
