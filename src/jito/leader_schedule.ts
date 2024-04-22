import { binarySearch, inspect, sleep } from "../common/utils";
import jitoClient from "./client";
import { SlotList } from "jito-ts/dist/gen/searcher";
import { backOff } from "exponential-backoff";
import { PublicKey } from "@solana/web3.js";
import solConnection from "../common/sol_connection";

export interface NextLeaderSlot {
  currentSlot: number;
  nextSlot: number;
}

export interface JitoLeaderSchedule {
  start(): Promise<void>;

  stop(): void;

  getNextLeaderSlot(): Promise<NextLeaderSlot>;

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

  async getNextLeaderSlot(): Promise<NextLeaderSlot> {
    const currentSlot = await solConnection.getSlot("recent");

    // Find the first slot in the snapshot that is greater or equal to the current slot with binary search.
    let startSlotIndex = binarySearch(
      this.leaderSlotsSnapshot,
      (i) => this.leaderSlotsSnapshot[i] < currentSlot,
    );

    if (startSlotIndex >= this.leaderSlotsSnapshot.length) {
      throw new Error("No leader slot found. Something went wrong.");
    }

    return {
      currentSlot,
      nextSlot: this.leaderSlotsSnapshot[startSlotIndex],
    };
  }
}

export class RealtimeJitoLeaderSchedule implements JitoLeaderSchedule {
  private stopped: boolean;
  private readonly requestIntervalMs: number;
  private tipAccounts: PublicKey[];
  private nextLeaderSlot: NextLeaderSlot;
  private recentErrors: number;

  constructor(requestIntervalMs: number) {
    this.stopped = false;
    this.recentErrors = 0;
    this.requestIntervalMs = requestIntervalMs;
    this.tipAccounts = [];
  }

  async getNextLeaderSlot(): Promise<NextLeaderSlot> {
    if (this.recentErrors > 0) {
      throw new Error(
        "Detected next leader slot fetching errors. Next leader slots maybe not up-to-date.",
      );
    }
    return this.nextLeaderSlot;
  }

  getTipAccounts(): PublicKey[] {
    return this.tipAccounts;
  }

  async start(): Promise<void> {
    const tipAccounts = await jitoClient.getTipAccounts();
    this.tipAccounts = tipAccounts.map((account) => new PublicKey(account));
    this.nextLeaderSlot = await this.fetchNextLeaderSlot();
    setImmediate(() => this.startUpdatingNextLeaderSlot());
  }

  stop(): void {
    this.stopped = true;
  }

  private async fetchNextLeaderSlot(): Promise<NextLeaderSlot> {
    const nextSlot = await jitoClient.getNextScheduledLeader();
    return {
      currentSlot: nextSlot.currentSlot,
      nextSlot: nextSlot.nextLeaderSlot,
    };
  }

  private async startUpdatingNextLeaderSlot() {
    while (!this.stopped) {
      await sleep(this.requestIntervalMs);
      try {
        this.nextLeaderSlot = await this.fetchNextLeaderSlot();
        this.recentErrors = 0;
      } catch (error) {
        console.error(`Error fetching next leader slot: ${error}`);
        this.recentErrors++;
      }
    }
  }
}

// const jitoLeaderSchedule = new BatchJitoLeaderSchedule(60);
const jitoLeaderSchedule = new RealtimeJitoLeaderSchedule(200);
export default jitoLeaderSchedule;
