// This file contains a custom predefined post-dialer that checks the SIP-010
// transfer function for the print event. For a token to be SIP-010 compliant,
// its transfer function must emit the print event with the `memo` content.
//
// This is just an example of the power of custom dialers. In sBTC, the
// transfer function did not emit the print event, resulting in sBTC not being
// SIP-010 compliant: https://github.com/stacks-sbtc/sbtc/issues/1090.
//
// This custom dialer allows for the detection of such issues for any fungible
// token contract in the future.
//
// References:
// https://github.com/stacksgov/sips/blob/2c3b36c172c0b71369bc26cffa080e8bdd2b3b84/sips/sip-010/sip-010-fungible-token-standard.md?plain=1#L69
// https://github.com/stacks-sbtc/sbtc/commit/74daed379e9aad73dd09bebb83231f2c48ef4d81

async function postTransferSip010PrintEvent(context) {
  const selectedFunction = context.selectedFunction;

  // A fungible token complies with the SIP-010 standard if the transfer event
  // always emits the print event with the `memo` content.
  if (selectedFunction.name !== "transfer") {
    return;
  }

  // Failed transfers roll back events and need no print-event check.
  if (context.functionCall.result.type !== "ok") return;

  const functionCallEvents = context.functionCall.events;

  // The `memo` parameter is the fourth parameter of the `rendezvous-token`'s
  // `transfer` function.
  const memoParameterIndex = 3;

  const memoGeneratedArgumentCV =
    context.clarityValueArguments[memoParameterIndex];

  // The `memo` argument is optional. If `none`, nothing has to be printed.
  if (memoGeneratedArgumentCV.type === "none") {
    return;
  }

  // If not `none`, the `memo` argument must be `some`. Otherwise, the
  // generated clarity argument is not an option type, so it does not comply
  // with the SIP-010 fungible token trait.
  if (memoGeneratedArgumentCV.type !== "some") {
    throw new Error("The memo argument has to be an option type!");
  }

  const sip010PrintEvent = functionCallEvents.find(
    (ev) => ev.event === "print_event",
  );

  if (!sip010PrintEvent) {
    throw new Error(
      "No print event found. The transfer function must emit the SIP-010 print event containing the memo!",
    );
  }

  const memoValue = JSON.stringify(memoGeneratedArgumentCV.value);
  const printEventValue = JSON.stringify(sip010PrintEvent.data.value);

  if (printEventValue !== memoValue) {
    throw new Error(
      `The print event memo value is not equal to the memo parameter value: ${memoValue} !== ${printEventValue}`,
    );
  }

  return;
}

module.exports = { postTransferSip010PrintEvent };
