import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PlusIcon from "@assets/svgs/plus2.svg";
import MinusIcon from "@assets/svgs/minus.svg";
import { useKeyStore } from "@stores/useKeyStore";
import Alert from "./Alert.jsx";
import TabNameModal from "./TabNameModal";

type TabListProps = {
  onClose?: () => void;
};

const TabList = ({ onClose }: TabListProps) => {
  const customTabs = useKeyStore((state) => state.customTabs);
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const setSelectedKeyType = useKeyStore((state) => state.setSelectedKeyType);
  const setCustomTabs = useKeyStore((state) => state.setCustomTabs);
  const { t } = useTranslation();

  const [isLoaded, setIsLoaded] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);

  useEffect(() => {
    let disposed = false;
    window.api.keys.customTabs
      .list()
      .then((tabs) => {
        if (disposed || !Array.isArray(tabs)) return;
        setCustomTabs(tabs);
      })
      .catch((error) => {
        console.error("Failed to load custom tabs", error);
      })
      .finally(() => {
        if (!disposed) {
          setIsLoaded(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, [setCustomTabs]);

  const isCustomSelected = useMemo(
    () => !["4key", "5key", "6key", "8key"].includes(selectedKeyType),
    [selectedKeyType]
  );

  const maxReached = customTabs.length >= 5;

  const handleCreate = async (name: string) => {
    const result = await window.api.keys.customTabs.create(name);
    if (!result?.error) {
      onClose?.();
    }
    return result;
  };

  const handleSelect = async (id: string) => {
    try {
      const result = await window.api.keys.customTabs.select(id);
      if (result?.success) {
        setSelectedKeyType(result.selected);
        onClose?.();
      }
      return result;
    } catch (error) {
      console.error("Failed to select custom tab", error);
      return { success: false };
    }
  };

  const handleDelete = async () => {
    try {
      const result = await window.api.keys.customTabs.delete(selectedKeyType);
      if (!result?.success) {
        console.warn("Failed to delete custom tab", result?.error);
      }
    } catch (error) {
      console.error("Failed to delete custom tab", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center max-w-[154px] bg-[#1A191E] rounded-[7px] border border-[#2A2A30]">
      <div className="min-h-[39px] w-full border-b-[1px] border-[#2A2A30] flex flex-col items-center justify-center p-[8px] gap-[8px]">
        {customTabs.length === 0 ? (
          <span className="text-style-2 text-[#DBDEE8]">{t("tabs.empty")}</span>
        ) : (
          <div className="flex flex-col w-[154px] gap-[6px] items-center">
            {[...customTabs]
              .slice()
              .reverse()
              .map((tab) => (
                <button
                  key={tab.id}
                  className={`w-[138px] h-[24px] flex items-center justify-center rounded-[7px] text-style-2 text-[#DBDEE8] hover:bg-[#26262C] active:bg-[#2A2A31] ${
                    selectedKeyType === tab.id ? "bg-[#26262C]" : ""
                  }`}
                  onClick={() => handleSelect(tab.id)}
                >
                  {tab.name}
                </button>
              ))}
          </div>
        )}
      </div>
      <div className="flex flex-row p-[8px] w-[154px] gap-[8px]">
        {!maxReached && (
          <button
            className="flex flex-1 items-center justify-center max-w-[138px] h-[22px] rounded-[7px] bg-[#2A2A30] hover:bg-[#303036] active:bg-[#393941]"
            onClick={() => setShowNameModal(true)}
            disabled={!isLoaded}
          >
            <PlusIcon />
          </button>
        )}
        {customTabs.length > 0 && (
          <button
            className={`flex flex-1 items-center justify-center max-w-[138px] h-[22px] rounded-[7px] ${
              isCustomSelected
                ? "bg-[#3C1E1E] hover:bg-[#442222] active:bg-[#522929]"
                : "bg-[#2A2A30] opacity-50 cursor-not-allowed"
            }`}
            disabled={!isCustomSelected}
            onClick={() => setAskDelete(true)}
          >
            <MinusIcon />
          </button>
        )}
      </div>

      <TabNameModal
        isOpen={showNameModal}
        onClose={() => setShowNameModal(false)}
        onSubmit={handleCreate}
        existingNames={customTabs.map((t) => t.name)}
      />

      <Alert
        isOpen={askDelete}
        type="confirm"
        message={t("tabs.deleteConfirm", {
          name: customTabs.find((t) => t.id === selectedKeyType)?.name || "",
        })}
        confirmText={t("tabs.delete")}
        onConfirm={async () => {
          setAskDelete(false);
          await handleDelete();
          onClose?.();
        }}
        onCancel={() => setAskDelete(false)}
      />
    </div>
  );
};

export default TabList;

