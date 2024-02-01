"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { encodePacked, keccak256, parseEther, toBytes } from "viem";
import { Address as useAccount, useWalletClient } from "wagmi";
import { useScaffoldContractWrite, useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import useSupabase from "~~/hooks/supabase/useSupabase";

const Store: NextPage = () => {
  const STREAM_ETH_VALUE = "0.25";
  const { data: userSigner } = useWalletClient();
  const { address: userAddress } = useAccount();

  const supabase = useSupabase();
  const [newOrder, setNewOrder] = useState({});

  const { writeAsync: orderProduct } = useScaffoldContractWrite({
    contractName: "DeliveryStore",
    functionName: "orderProduct",
    args: ["Product"],
    value: parseEther(STREAM_ETH_VALUE),
  });

  const { writeAsync: openChannel } = useScaffoldContractWrite({
    contractName: "DeliveryStore",
    functionName: "openChannel",
    value: parseEther(STREAM_ETH_VALUE),
  });

  const { data: openedHistoryData, isLoading: isOpenedHistoryLoading } = useScaffoldEventHistory({
    contractName: "DeliveryStore",
    eventName: "OrderPlaced",
    fromBlock: 0n,
  });

  const { data: openedHistoryDataChannel, isLoading: isOpenedHistoryLoadingChannel } = useScaffoldEventHistory({
    contractName: "DeliveryStore",
    eventName: "ChannelOpened",
    fromBlock: 0n,
  });

  console.log(openedHistoryDataChannel);
  console.log(isOpenedHistoryLoadingChannel);

  function extractLatestOrderId(openedHistoryData) {
    if (openedHistoryData.length === 0) {
      return 0;
    }
    const latestOrderEvent = openedHistoryData[openedHistoryData.length - openedHistoryData.length];
    if (latestOrderEvent && latestOrderEvent.args) {
      const latestOrderId = latestOrderEvent.args.orderId;
      return latestOrderId;
    }
    return null;
  }

  const handleCreateOrder = async (productId, productPrice) => {
    try {
      const latestOrderId = extractLatestOrderId(openedHistoryData);

      if (latestOrderId === null) {
        console.error("Unable to determine the latest order ID");
        return;
      }

      const orderData = {
        orderid: Number(latestOrderId),
        customer: String(userAddress),
        product: `${productId}`,
        price: parseEther(`${productPrice}`),
        status: "Processing",
        deliverypersonaddress: "",
      };

      console.log(orderData);

      const packed = encodePacked(
        ["string", "string", "uint256", "string", "string"],
        [orderData.customer, orderData.product, orderData.price, orderData.status, orderData.deliverypersonaddress],
      );

      const hashed = keccak256(packed);
      const arrayified = toBytes(hashed);

      const clientSignature = await userSigner?.signMessage({ message: { raw: arrayified } });

      const signedOrder = {
        ...orderData,
        clientSignature,
      };

      const formattedOrder = {
        orderid: signedOrder.orderid,
        customer: signedOrder.customer,
        product: signedOrder.product,
        price: Number(signedOrder.price),
        status: signedOrder.status,
        deliverypersonaddress: signedOrder.deliverypersonaddress,
        clientSignature: signedOrder.clientSignature,
      };

      setNewOrder(formattedOrder);
      orderProduct();
    } catch (error) {
      console.error("Error creating order:", error);
    }
  };

  useEffect(() => {
    const upsertOrder = async () => {
      try {
        console.log(newOrder);

        const { data, error } = await supabase.from("orders").upsert([newOrder]);

        if (error) {
          console.error("Error upserting order:", error);
        } else {
          console.log("Order upserted successfully:", data);
        }
      } catch (error) {
        console.error("Error upserting order:", error);
      }
    };

    if (newOrder.customer) {
      upsertOrder();
    }
  }, [newOrder]);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const openChannelModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const [isChannelOpen, setIsChannelOpen] = useState(false);

  useEffect(() => {
    if (openedHistoryDataChannel) {
      const channelIsOpen = openedHistoryDataChannel.some(channel => channel.args.customer === userAddress);
      setIsChannelOpen(channelIsOpen);
    }
  }, [openedHistoryDataChannel, userAddress]);

  const handleClick = item => {
    if (isChannelOpen) {
      console.log(item);
      handleCreateOrder(item.product_id, item.price);
    } else {
      openChannelModal();
    }
  };

  const [productData, setProductData] = useState([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase.from("products").select("*");

        if (error) {
          console.error("Error fetching products:", error);
        } else {
          setProductData(data);
        }
      } catch (error) {
        console.error("Error fetching products:", error.message);
      }
    };
    console.log(productData);

    fetchProducts();
  }, [supabase]);

  return (
    <>
      <div className="flex items-center ">
        {productData.map((item, index) => (
          <div key={index} className="card w-60 bg-base-100 shadow-xl">
            <div className="card-body items-center text-center">
              <h2 className="card-title">{item.product_name}</h2>
              <p>{item.price}</p>
              <div className="card-actions">
                <button className="btn btn-primary" onClick={() => handleClick(item)}>
                  {isChannelOpen ? "Buy" : "Open a channel"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-black bg-opacity-50 absolute inset-0"></div>
          <div className="card w-96 bg-neutral text-neutral-content">
            <div className="card-body items-center text-center">
              <div>
                <h2 className="card-title">Open a channel to start shopping.</h2>
                <p>0.25 ETH</p>
                <p>Any remaining amount will be refunded.</p>
              </div>
              <div className="card-actions justify-end">
                <button className="btn btn-primary" onClick={openChannel}>
                  Open
                </button>
                <button className="btn btn-ghost" onClick={handleCloseModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Store;
