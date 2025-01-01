import { Injectable } from '@nestjs/common';
import { CrawlingResult } from './web-graph.crawler';

interface Graph {
  [key: string]: [string[], number];
}

interface RankResult {
  page_name: string;
  rank: number;
  to: number;
  from: number;
}

export interface RankResponse {
  ranks_send: RankResult[];
  ranks_keep: { [key: string]: number };
}

@Injectable()
export class PageRankService {
  private createGraph(
    nodes: { name: string }[],
    links: { source: string; target: string }[],
  ): Graph {
    const graph: Graph = {};

    // Initialize graph with empty arrays and zero incoming links
    for (const node of nodes) {
      graph[node.name] = [[], 0];
    }

    // Add links and count incoming links
    for (const link of links) {
      graph[link.source][0].push(link.target);
      graph[link.target][1] += 1;
    }

    return graph;
  }

  private convertGraphToArray(
    rank: { [key: string]: number },
    graph: Graph,
  ): RankResult[] {
    const ranks: RankResult[] = [];

    // Sort pages by rank in descending order
    const sortedPages = Object.keys(rank).sort((a, b) => rank[b] - rank[a]);

    for (const page of sortedPages) {
      ranks.push({
        page_name: page,
        rank: rank[page],
        to: graph[page][0].length,
        from: graph[page][1],
      });
    }

    return ranks;
  }

  private computeRanks(graph: Graph): { [key: string]: number } {
    const dampingFactor = 0.8;
    const numLoops = 10;
    const numPages = Object.keys(graph).length;

    // Initialize ranks
    let ranks: { [key: string]: number } = {};
    for (const page in graph) {
      ranks[page] = 1.0 / numPages;
    }

    // Iterate to compute new ranks
    for (let i = 0; i < numLoops; i++) {
      const newRanks: { [key: string]: number } = {};

      for (const page in graph) {
        let newRank = (1 - dampingFactor) / numPages;

        for (const node in graph) {
          if (graph[node][0].includes(page)) {
            newRank += dampingFactor * (ranks[node] / graph[node][0].length);
          }
        }

        newRanks[page] = newRank;
      }

      ranks = newRanks;
    }

    return ranks;
  }

  public startRanking(crawlingResult: CrawlingResult): RankResponse | [] {
    // Check if result is empty or has no links
    if (!crawlingResult || crawlingResult.links.length === 0) {
      return [];
    }

    const graph = this.createGraph(crawlingResult.nodes, crawlingResult.links);
    const rank = this.computeRanks(graph);
    const ranks = this.convertGraphToArray(rank, graph);

    return {
      ranks_send: ranks,
      ranks_keep: rank,
    };
  }
}
