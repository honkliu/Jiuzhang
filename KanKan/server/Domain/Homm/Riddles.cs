namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


public record Riddle(string Answer, string[] Fragments);

public static class Riddles
{
    /// <summary>
    /// Built-in riddles. Each has an answer and exactly 10 clue fragments.
    /// The server picks one at game creation; no player knows the answer in advance.
    /// </summary>
    public static readonly Riddle[] All =
    {
        new("echo", new[]
        {
            "I speak without a mouth and hear without ears.",
            "I have no body, but I come alive with wind.",
            "Shout into a canyon and I answer.",
            "I repeat what you say, but never first.",
            "I am the last word, spoken twice.",
            "I have no substance, yet I fill a hall.",
            "I am born of sound and die in silence.",
            "I follow your voice like a shadow.",
            "I am the canyon's only reply.",
            "I am what returns when you call."
        }),
        new("shadow", new[]
        {
            "I follow you everywhere but never speak.",
            "I am longest at dawn and dusk.",
            "I vanish when the sun is overhead.",
            "I am cast by light, not made by it.",
            "I have no weight, yet I can frighten.",
            "I am your shape, but not your self.",
            "I stretch across the floor at noon.",
            "I am the dark twin of everything.",
            "I am born when you block the sun.",
            "I am what the lamp throws on the wall."
        }),
        new("river", new[]
        {
            "I have a mouth but never speak.",
            "I have a bed but never sleep.",
            "I run without legs.",
            "I am always moving, never arriving.",
            "I begin as a trickle in the hills.",
            "I end in the sea, but I am not the sea.",
            "I carve stone with patience.",
            "I have banks but no money.",
            "I am crossed by bridges.",
            "I am the long water that goes to the sea."
        }),
        new("candle", new[]
        {
            "I am tall when young and short when old.",
            "I give light by consuming myself.",
            "I weep as I burn.",
            "I am found on a birthday cake.",
            "I have a wick and a flame.",
            "I am snuffed out with a breath.",
            "I stand in a holder of brass.",
            "I am the light of a dark room.",
            "I am made of wax.",
            "I am what you light at dinner."
        }),
        new("key", new[]
        {
            "I have teeth but cannot bite.",
            "I open what is locked.",
            "I am small and easily lost.",
            "I am cut to fit one lock.",
            "I hang on a ring with my brothers.",
            "I am turned, not pushed.",
            "I am the answer to a locked door.",
            "I am made of iron or brass.",
            "I am what you keep in your pocket.",
            "I am the metal that opens."
        }),
        new("book", new[]
        {
            "I have a spine but no bones.",
            "I have leaves but no branches.",
            "I am read but never eaten.",
            "I hold many words but speak none.",
            "I am shelved in a library.",
            "I am opened at a page.",
            "I have a cover and a title.",
            "I am the friend of the quiet.",
            "I am bound in cloth or leather.",
            "I am the volume you read."
        }),
        new("clock", new[]
        {
            "I have hands but cannot clap.",
            "I have a face but no eyes.",
            "I tick but never tock alone.",
            "I measure what cannot be held.",
            "I am wound to keep going.",
            "I strike the hour.",
            "I hang on a wall or sit on a mantel.",
            "I am the keeper of the hours.",
            "I have numbers but no arithmetic.",
            "I am the thing that tells the time."
        }),
        new("mirror", new[]
        {
            "I show you yourself, but backwards.",
            "I am silvered on one side.",
            "I break into seven years of bad luck.",
            "I am hung above a washbasin.",
            "I copy everything, but hold nothing.",
            "I am the opposite of a window.",
            "I am polished to be true.",
            "I am what the vain consult.",
            "I am glass backed with metal.",
            "I am the surface that reflects."
        }),
        new("mountain", new[]
        {
            "I have a peak but no hat.",
            "I am climbed but never walked on flat.",
            "I wear snow in summer.",
            "I am older than any city.",
            "I am made of stone and patience.",
            "I am the roof of the world.",
            "I cast a long shadow at dawn.",
            "I am crossed by passes.",
            "I am the high place.",
            "I am the great stone that touches the sky."
        }),
        new("bridge", new[]
        {
            "I have a span but no wings.",
            "I carry you over water.",
            "I am built of stone or wood.",
            "I have arches beneath me.",
            "I connect two banks.",
            "I am crossed but never walked alone.",
            "I am the road over the river.",
            "I am supported by piers.",
            "I am what you build to cross.",
            "I am the span across the water."
        }),
        new("fire", new[]
        {
            "I am hungry and eat wood.",
            "I give warmth and take life.",
            "I dance without feet.",
            "I am born from a spark.",
            "I am quenched by water.",
            "I am red and gold and hot.",
            "I am the light of the hearth.",
            "I spread when fed.",
            "I am the flame.",
            "I am what burns."
        }),
        new("wind", new[]
        {
            "I am felt but never seen.",
            "I move the sails of ships.",
            "I am named for the four directions.",
            "I bend the trees.",
            "I carry seeds and dust.",
            "I am still on a calm day.",
            "I howl in a storm.",
            "I am the breath of the world.",
            "I push the clouds.",
            "I am the moving air."
        }),
        new("star", new[]
        {
            "I am seen only at night.",
            "I am far beyond reach.",
            "I twinkle but never blink.",
            "I am counted by the thousand.",
            "I guide the lost traveller.",
            "I am born and die over ages.",
            "I am the point of light in the dark.",
            "I am named in constellations.",
            "I am the sun of another world.",
            "I am the light in the night sky."
        }),
        new("door", new[]
        {
            "I have a handle but no hand.",
            "I am opened and closed.",
            "I stand in a frame.",
            "I keep the outside out.",
            "I am knocked upon.",
            "I have a threshold beneath me.",
            "I am locked at night.",
            "I am the way in.",
            "I swing on hinges.",
            "I am the entrance."
        }),
        new("well", new[]
        {
            "I am deep and dark and full of water.",
            "I am dug, not built.",
            "I have a bucket and a rope.",
            "I am found in the village square.",
            "I am covered with a stone lid.",
            "I am the source of the village water.",
            "I am cold even in summer.",
            "I am wished upon with a coin.",
            "I am the hole that gives water.",
            "I am the deep water."
        }),
        new("crown", new[]
        {
            "I am worn on the head but am not hair.",
            "I am made of gold and gems.",
            "I am the mark of a ruler.",
            "I am heavy to wear.",
            "I am placed by a ceremony.",
            "I have points like a sun.",
            "I am the symbol of the king.",
            "I am kept in a vault.",
            "I am the royal headpiece.",
            "I am what the monarch wears."
        }),
        new("ladder", new[]
        {
            "I have rungs but no wheels.",
            "I am leaned against a wall.",
            "I take you up, one step at a time.",
            "I am made of wood or rope.",
            "I am the way to the roof.",
            "I have two rails and many steps.",
            "I am climbed, not walked.",
            "I am the tool of the painter.",
            "I am the vertical path.",
            "I am what you climb."
        }),
        new("anchor", new[]
        {
            "I hold a ship in place.",
            "I am dropped to the sea floor.",
            "I have flukes and a shank.",
            "I am the sailor's hope in a storm.",
            "I am heavy and iron.",
            "I am raised with a chain.",
            "I am the symbol of stability.",
            "I am found on a ship's bow.",
            "I am the hook that holds.",
            "I am what keeps the ship from drifting."
        }),
        new("lantern", new[]
        {
            "I am carried in the dark.",
            "I have a flame inside glass.",
            "I am hung on a pole.",
            "I light the way at night.",
            "I am the friend of the night watchman.",
            "I am swung as you walk.",
            "I am made of metal and glass.",
            "I am the portable light.",
            "I am what you carry to see.",
            "I am the light in the hand."
        }),
        new("harbor", new[]
        {
            "I am where ships rest.",
            "I am sheltered from the waves.",
            "I have piers and moorings.",
            "I am the edge of the sea and the land.",
            "I am busy with cargo.",
            "I am the sailor's home.",
            "I am protected by a breakwater.",
            "I am where the voyage ends.",
            "I am the safe water.",
            "I am the port."
        })
    };

    public static Riddle Pick(Random rng) => All[rng.Next(All.Length)];
}