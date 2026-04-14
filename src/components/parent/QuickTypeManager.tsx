"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Database } from "@/lib/supabase/types";

type CustomType = Database["public"]["Tables"]["custom_homework_types"]["Row"];

interface QuickTypeManagerProps {
  types: CustomType[];
  onAdd: (name: string, icon: string, points: number) => Promise<void>;
  onUpdate: (id: string, name: string, icon: string, points: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const ICONS = ["📝", "✏️", "📋", "🎨", "⚽", "🏀", "🎸", "🧮", "🔬", "📐", "✍️", "🗣️", "🎹", "📖", "💻", "📚", "🔢", "🇨🇳", "🏐", "👯", "🎭", "🧹", "📸", "🎵", "🌟"];

export function QuickTypeManager({ types, onAdd, onUpdate, onDelete }: QuickTypeManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("📝");
  const [formPoints, setFormPoints] = useState(3);

  const handleAdd = async () => {
    if (!formName.trim()) return;
    await onAdd(formName.trim(), formIcon, formPoints);
    setShowForm(false);
    setFormName("");
    setFormIcon("📝");
    setFormPoints(3);
  };

  const handleEdit = (type: CustomType) => {
    setEditingId(type.id);
    setFormName(type.name);
    setFormIcon(type.icon || "📝");
    setFormPoints(type.default_points ?? 3);
    setShowForm(true);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !formName.trim()) return;
    await onUpdate(editingId, formName.trim(), formIcon, formPoints);
    setEditingId(null);
    setShowForm(false);
    setFormName("");
    setFormIcon("📝");
    setFormPoints(3);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormIcon("📝");
    setFormPoints(3);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-forest-700">作业类型</h3>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            新增类型
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-2xl border border-forest-200 bg-forest-50 p-4 space-y-3">
          <Input
            label="类型名称"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="如：钢琴、阅读"
          />
          <div className="space-y-2">
            <p className="text-sm font-medium text-forest-600">选择图标</p>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormIcon(icon)}
                  className={`text-2xl p-2 rounded-xl transition ${
                    formIcon === icon ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-forest-100"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="默认积分"
            type="number"
            value={formPoints}
            onChange={(e) => setFormPoints(Number(e.target.value))}
            min={1}
            max={20}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={editingId ? handleSaveEdit : handleAdd}>
              {editingId ? "保存" : "添加"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>
              取消
            </Button>
          </div>
        </div>
      )}

      {types.length === 0 && !showForm ? (
        <p className="text-sm text-forest-400">还没有自定义类型</p>
      ) : (
        <div className="space-y-2">
          {types.map((type) => (
            <div key={type.id} className="flex items-center gap-3 rounded-xl border border-forest-100 bg-white px-4 py-3">
              <span className="text-2xl">{type.icon || "📝"}</span>
              <div className="flex-1">
                <p className="font-medium text-forest-700">{type.name}</p>
                <p className="text-xs text-forest-400">{type.default_points ?? 3} 积分</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleEdit(type)}>
                编辑
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(type.id)} className="text-red-500">
                删除
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
