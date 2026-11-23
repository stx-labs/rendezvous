const assert = require("node:assert/strict");

const { Cl, ClarityType } = require("@stacks/transactions");

/** @param {import("@stacks/rendezvous").DialerContext} context */
function postBalanceConservation({ simnet, contractId }) {
  const readUint = (name, args = []) => {
    const { result } = simnet.callReadOnlyFn(
      contractId,
      name,
      args,
      simnet.deployer,
    );
    assert.equal(result.type, ClarityType.UInt);
    return result.value;
  };

  // The contract normalizes all keys to these four slots.
  const sum = [0, 1, 2, 3].reduce(
    (total, slot) => total + readUint("get-balance", [Cl.uint(slot)]),
    0n,
  );
  assert.equal(sum, readUint("get-total"), "balance conservation failed");
}

module.exports = { postBalanceConservation };
