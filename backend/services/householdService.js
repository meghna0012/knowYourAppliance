import crypto from "crypto";
import Household from "../models/Household.js";
import User from "../models/User.js";
import Appliance from "../models/Appliance.js";

export const MAX_HOUSEHOLD_MEMBERS = 10;

// No 0/O or 1/I so codes survive being read aloud or typed from a screenshot.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export class HouseholdError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const generateInviteCode = () =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
  ).join("");

export const normalizeInviteCode = (code) =>
  String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const isDuplicateInviteCode = (err) =>
  err?.code === 11000 && err?.keyPattern?.inviteCode;

const withFreshInviteCode = async (fn) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn(generateInviteCode());
    } catch (err) {
      if (!isDuplicateInviteCode(err)) throw err;
    }
  }
  throw new Error("Could not generate a unique invite code");
};

export const regenerateInviteCode = (household) =>
  withFreshInviteCode((inviteCode) => {
    household.inviteCode = inviteCode;
    return household.save();
  });

export const findHouseholdByInviteCode = async (rawCode) => {
  const inviteCode = normalizeInviteCode(rawCode);
  const household = inviteCode && (await Household.findOne({ inviteCode }));
  if (!household) throw new HouseholdError(400, "Invalid invite code");
  return household;
};

export const assertHasRoom = async (household) => {
  const count = await User.countDocuments({ household: household._id });
  if (count >= MAX_HOUSEHOLD_MEMBERS) {
    throw new HouseholdError(
      400,
      `This household is full (max ${MAX_HOUSEHOLD_MEMBERS} members)`
    );
  }
};

// Gives `user` a brand-new household they administer. The user update is a
// compare-and-set on their previous household so concurrent requests (e.g.
// React StrictMode double-fetching) can't leave them with two households.
export const createPersonalHousehold = async (user) => {
  const previous = user.household ?? null;

  const household = await withFreshInviteCode((inviteCode) =>
    Household.create({
      name: `${user.name}'s household`,
      admin: user._id,
      inviteCode,
    })
  );

  const { modifiedCount } = await User.updateOne(
    { _id: user._id, household: previous },
    { $set: { household: household._id } }
  );

  if (modifiedCount === 0) {
    await household.deleteOne();
    const fresh = await User.findById(user._id).select("household");
    user.household = fresh?.household;
    return Household.findById(user.household);
  }

  user.household = household._id;
  return household;
};

// Users created before households existed get one lazily, and their
// appliances are moved into it.
export const ensureHousehold = async (user) => {
  if (user.household) return;
  await createPersonalHousehold(user);
  await Appliance.updateMany(
    { user: user._id, household: { $exists: false } },
    { $set: { household: user.household } }
  );
};

const countOtherMembers = (household, user) =>
  User.countDocuments({ household: household._id, _id: { $ne: user._id } });

export const joinHousehold = async (user, target) => {
  if (user.household?.equals(target._id)) {
    throw new HouseholdError(400, "You're already a member of this household");
  }
  await assertHasRoom(target);

  const current = await Household.findById(user.household);
  const othersInCurrent = current ? await countOtherMembers(current, user) : 0;

  if (current && othersInCurrent > 0 && current.admin.equals(user._id)) {
    throw new HouseholdError(
      400,
      "You're the admin of your current household. Make another member admin before joining a new one."
    );
  }

  // A household nobody is left in would orphan its appliances, so bring them
  // along. Appliances move before the user so a crash never loses data.
  if (current && othersInCurrent === 0) {
    await Appliance.updateMany(
      { household: current._id },
      { $set: { household: target._id } }
    );
  }

  await User.updateOne({ _id: user._id }, { $set: { household: target._id } });
  user.household = target._id;

  if (current && othersInCurrent === 0) {
    await current.deleteOne();
  }
  return target;
};

// Appliances the user added stay with the household they're leaving.
export const leaveHousehold = async (user) => {
  const current = await Household.findById(user.household);
  if (!current) throw new HouseholdError(404, "Household not found");

  if ((await countOtherMembers(current, user)) === 0) {
    throw new HouseholdError(400, "You're the only member of this household");
  }
  if (current.admin.equals(user._id)) {
    throw new HouseholdError(
      400,
      "Make another member admin before leaving the household"
    );
  }
  return createPersonalHousehold(user);
};

export const removeMember = async (household, memberId) => {
  if (household.admin.equals(memberId)) {
    throw new HouseholdError(400, "The admin can't remove themselves");
  }
  const member = await User.findOne({ _id: memberId, household: household._id });
  if (!member) throw new HouseholdError(404, "Member not found in this household");

  await createPersonalHousehold(member);
};

export const transferAdmin = async (household, memberId) => {
  const member = await User.exists({ _id: memberId, household: household._id });
  if (!member) throw new HouseholdError(404, "Member not found in this household");

  household.admin = memberId;
  await household.save();
  return household;
};
