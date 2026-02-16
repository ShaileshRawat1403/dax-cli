import type { Component } from "solid-js";

export interface Principle {
  id: number;
  title: string;
  description: string;
}

interface PrincipleCardProps {
  principle: Principle;
}

const PrincipleCard: Component<PrincipleCardProps> = (props) => {
  return (
    <div class="glass rounded-xl p-6 flex gap-6 items-start">
      <div class="w-10 h-10 bg-cognito-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <span class="text-cognito-400 font-bold font-mono">
          {props.principle.id}
        </span>
      </div>
      <div>
        <h3 class="text-white font-semibold text-lg mb-1">
          {props.principle.title}
        </h3>
        <p class="text-gray-400 text-sm">{props.principle.description}</p>
      </div>
    </div>
  );
};

export default PrincipleCard;
