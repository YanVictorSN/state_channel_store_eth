"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { encodePacked, keccak256, toBytes, verifyMessage } from "viem";
import { Address as useAccount, useWalletClient } from "wagmi";
import { AddressInput } from "~~/components/scaffold-eth";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldContractRead, useScaffoldContractWrite, useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import useSupabase from "~~/hooks/supabase/useSupabase";

type YourObjectType = {
  orderid: number;
  customer: string;
  product: string;
  price: bigint;
  status: string;
  deliverypersonaddress: string;
  clientSignature: string;
  ownerSignature: string;
};

const Orders: NextPage = () => {
  const [data, setData] = useState<Array<YourObjectType>>([]);
  const { data: ownerSigner } = useWalletClient();

  const supabase = useSupabase();

  const { data: openedHistoryData, isLoading: isOpenedHistoryLoading } = useScaffoldEventHistory({
    contractName: "DeliveryStore",
    eventName: "OrderPlaced",
    fromBlock: 0n,
  });
  console.log(openedHistoryData);
  console.log(isOpenedHistoryLoading);

  const { data: openedHistoryDataChannel, isLoading: isOpenedHistoryLoadingChannel } = useScaffoldEventHistory({
    contractName: "DeliveryStore",
    eventName: "ChannelOpened",
    fromBlock: 0n,
  });
  console.log(openedHistoryDataChannel);
  console.log(isOpenedHistoryLoadingChannel);

  const { address: userAddress } = useAccount();
  const { data: ownerAddress } = useScaffoldContractRead({
    contractName: "DeliveryStore",
    functionName: "owner",
  });

  const userIsOwner = !!ownerAddress && ownerAddress === userAddress;
  const [userIsDeliveryPerson, setUserIsDeliveryPerson] = useState(false);

  function isDelivery(addressData, address) {
    return addressData.some(item => item.args.deliveryPersonAddress === address);
  }

  useEffect(() => {
    if (openedHistoryData != undefined) {
      const userIsDeliveryPerson = isDelivery(openedHistoryData, userAddress);
      setUserIsDeliveryPerson(userIsDeliveryPerson);
    }
  }, [openedHistoryData]);

  const processedCustomers = new Set();

  const fetchDataForCustomer = async customer => {
    console.log(customer.customer);

    if (processedCustomers.has(customer.customer)) {
      console.log(
        `Customer ${customer.id} with delivery address ${customer.deliveryAddress} already processed. Skipping.`,
      );
      return null;
    }
    processedCustomers.add(customer);

    const { data: orderDetails, error } = await supabase.from("orders").select("*").eq("customer", customer.customer);
    if (error) {
      console.error(`Error fetching data for customer ${customer}:`, error.message);
      return null;
    }
    return orderDetails;
  };

  const formatData = historyData => {
    return historyData.map(item => ({
      customer: item.args.customer,
      deliveryAddress: item.args.deliveryPersonAddress,
    }));
  };

  useEffect(() => {
    const fetchDataAndUpdateState = async () => {
      try {
        if (userIsOwner) {
          const formattedData = formatData(openedHistoryData);
          console.log(formattedData);

          const fetchedDataPromises = formattedData.map(async orderData => {
            return fetchDataForCustomer(orderData);
          });
          const fetchedData = await Promise.all(fetchedDataPromises);
          const flattenedData = fetchedData.flat();
          console.log(flattenedData);

          if (JSON.stringify(data) !== JSON.stringify(flattenedData)) {
            setData(flattenedData);
          }
        } else {
          const { data: orderDetails, error } = await supabase.from("orders").select("*").eq("customer", userAddress);
          if (error) {
            console.error(`Error fetching data for customer ${userAddress}:`, error.message);
            return;
          }
          console.log(orderDetails);
          setData(orderDetails);
        }
      } catch (error) {
        console.error("Error processing data:", error.message);
      }
    };

    if (openedHistoryData !== undefined) {
      fetchDataAndUpdateState();
    }
  }, [openedHistoryData]);

  const confirmOrder = async (orderId: number) => {
    console.log(orderId);

    // Update the status in the existing data
    const updatedData = data.map(item => (item.orderid === orderId ? { ...item, status: "Accepted" } : item));
    console.log(updatedData);

    // Find the specific updated item
    const updatedItem = updatedData.find(item => item.orderid === orderId);
    console.log(updatedItem);

    // Ensure the item is found before proceeding
    if (updatedItem) {
      const packed = encodePacked(
        ["string", "string", "uint256", "string", "string"],
        [
          updatedItem.customer,
          updatedItem.product,
          updatedItem.price,
          updatedItem.status,
          updatedItem.deliverypersonaddress,
        ],
      );

      const hashed = keccak256(packed);
      const arrayified = toBytes(hashed);

      const ownerSignature = await ownerSigner?.signMessage({ message: { raw: arrayified } });

      const confirmedOrder = {
        ...updatedItem,
        ownerSignature,
      };

      console.log(confirmedOrder);

      setData(updatedData);
      updateOrder(confirmedOrder.orderid, confirmedOrder);
      console.log(data);
    } else {
      console.error("Item not found for orderId:", orderId);
    }
  };

  const updateOrder = async (orderId, confirmedOrder) => {
    try {
      const { data, error } = await supabase.from("orders").update(confirmedOrder).eq("orderid", orderId);

      if (error) {
        console.error("Error updating order:", error.message);
      } else {
        console.log("Order updated successfully:", data);
      }
    } catch (error) {
      console.error("Error updating order:", error.message);
    }
  };

  const updateDeliveryAddress = async (orderId, deliveryPersonAddress) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({ deliverypersonaddress: deliveryPersonAddress, status: "EnRoute" })
        .eq("orderid", orderId);

      if (error) {
        console.error("Error updating order:", error.message);
      } else {
        console.log("Order updated successfully:", data);
      }
    } catch (error) {
      console.error("Error updating order:", error.message);
    }
  };

  const [orderAddresses, setOrderAddresses] = useState({});
  const [orderId, setOrderId] = useState("");
  const { writeAsync: setDeliveryPerson } = useScaffoldContractWrite({
    contractName: "DeliveryStore",
    functionName: "setDeliveryPerson",
    args: [BigInt(orderId), orderAddresses[orderId]],
  });

  function handleDeliveryAddress() {
    setDeliveryPerson(orderId, orderAddresses[orderId]);
    updateDeliveryAddress(orderId, orderAddresses[orderId]);
  }
  console.log(data);

  const [dataDeliveryOnChain, setDataDeliveryOnChain] = useState([]);

  const { writeAsync: confirmDeliveryOnChain } = useScaffoldContractWrite({
    contractName: "DeliveryStore",
    functionName: "confirmDelivery",
    args: [],
  });

  async function confirmDeliveryTest() {
    const updatedBalance = data[0].clientSignature;
    console.log(updatedBalance);

    const orderData = {
      orderid: Number(data[0].orderid),
      customer: String(userAddress),
      product: `${data[0].product}`,
      price: BigInt(`${data[0].price}`),
      status: "Processing",
      deliverypersonaddress: "",
    };

    const packed = encodePacked(
      ["string", "string", "uint256", "string", "string"],
      [orderData.customer, orderData.product, orderData.price, orderData.status, orderData.deliverypersonaddress],
    );

    const hashed = keccak256(packed);
    const arrayified = toBytes(hashed);

    const validate = await verifyMessage({
      address: userAddress,
      message: { raw: arrayified },
      signature: updatedBalance as `0x${string}`,
    });

    if (validate) {
      confirmDeliveryOnChain();
    }
  }

  return (
    <>
      <div className="flex items-center flex-col pt-10">
        {userIsOwner ? (
          <table className="table-lg">
            {/* head */}
            <thead>
              <tr>
                <th></th>
                <th>Address</th>
                <th>Product</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={index} className="hover">
                  <th>{item.orderid}</th>
                  <td>
                    <Address address={item.customer} />
                  </td>
                  <td>{item.product}</td>
                  <td>{Number(item.price) / 1e18} ETH</td>
                  <td>{item.status}</td>
                  <div className="flex">
                    <button onClick={() => confirmOrder(item.orderid)} className="btn btn-success">
                      Confirm Order
                    </button>
                    <AddressInput
                      onChange={newAddress => {
                        setOrderAddresses(prevAddresses => ({
                          ...prevAddresses,
                          [item.orderid]: newAddress,
                        }));
                      }}
                      value={orderAddresses[item.orderid] || ""}
                      placeholder="Input your address"
                    />
                    <button
                      onClick={() => {
                        setOrderId(item.orderid);
                        handleDeliveryAddress();
                      }}
                      className="btn btn-active btn-primary"
                    >
                      Set Delive
                    </button>
                  </div>
                </tr>
              ))}
              {/* row 1 */}
            </tbody>
          </table>
        ) : userIsDeliveryPerson ? (
          <div>
            <p>DeliveryPerson</p>
          </div>
        ) : (
          <>
            <div>
              <p>My orders</p>
            </div>
            <div>
              <table className="table-lg">
                {/* head */}
                <thead>
                  <tr>
                    <th></th>
                    <th>Address</th>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Delivery Address</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, index) => (
                    <tr key={index} className="hover">
                      <th>{item.orderid}</th>
                      <td>
                        <Address address={item.customer} />
                      </td>
                      <td>{item.product}</td>
                      <td>{Number(item.price) / 1e18} ETH</td>
                      <td>{item.status}</td>
                      <td>{item.deliverypersonaddress}</td>
                      <button className="btn btn-active btn-primary" onClick={confirmDeliveryTest}>
                        Confirm Delivery
                      </button>
                    </tr>
                  ))}
                  {/* row 1 */}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default Orders;
