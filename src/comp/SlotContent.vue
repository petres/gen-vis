<script>
// the content of a slot of the GenVis component, e.g. of the hover, in a
// component inside of it, the slot is a function of its props
export default {
    props: ["fn", "props"],
    render() {
        return this.fn(this.props);
    },
};
</script>
